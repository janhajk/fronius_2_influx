const http = require('http');
const Influx1x = require('influx'); // Für InfluxDB 1.x
const { InfluxDB: Influx2x, Point } = require('@influxdata/influxdb-client'); // Für InfluxDB 2.x

// Konfiguration aus Umgebungsvariablen
const config = {
  meter: {
    host: process.env.APIOKEX_KEY, // Host des Fronius-Geräts
  },
  log: process.env.LOG === 'true', // Log-Flag als Boolean
};

// Fronius API-Endpunkte
const froniusApi = {
  GetInverterRealtimeData: '/solar_api/v1/GetInverterRealtimeData.cgi?Scope=System',
  GetMeterRealtimeData: '/solar_api/v1/GetMeterRealtimeData.cgi?Scope=System',
};

// InfluxDB-Client dynamisch initialisieren
let influxClient, writeData;

if (process.env.INFLUX_TOKEN && process.env.INFLUX_ORG && process.env.INFLUX_BUCKET) {
  // InfluxDB 2.x
  console.log('Using InfluxDB 2.x');
  const influx2x = new Influx2x({
    url: `http://${process.env.INFLUX_HOST}:${process.env.INFLUX_PORT}`,
    token: process.env.INFLUX_TOKEN,
  });
  influxClient = influx2x.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
  writeData = async (data) => {
    const point = new Point('powerdata')
      .floatField('pac', data.pac)
      .floatField('grid', data.grid)
      .floatField('total', data.pac + data.grid)
      .floatField('day_energy', data.day_energy);
    await influxClient.writePoint(point);
    if (config.log) console.log('Wrote data to InfluxDB 2.x');
  };
} else if (process.env.INFLUX_USER && process.env.INFLUX_PSW && process.env.INFLUX_DB) {
  // InfluxDB 1.x
  console.log('Using InfluxDB 1.x');
  influxClient = new Influx1x.InfluxDB({
    host: process.env.INFLUX_HOST,
    port: process.env.INFLUX_PORT,
    username: process.env.INFLUX_USER,
    password: process.env.INFLUX_PSW,
    database: process.env.INFLUX_DB,
    schema: [
      {
        measurement: 'powerdata',
        fields: {
          pac: Influx1x.FieldType.FLOAT,
          grid: Influx1x.FieldType.FLOAT,
          total: Influx1x.FieldType.FLOAT,
          day_energy: Influx1x.FieldType.FLOAT,
        },
        tags: [],
      },
    ],
  });
  writeData = async (data) => {
    await influxClient.writePoints([
      {
        measurement: 'powerdata',
        fields: {
          pac: data.pac,
          grid: data.grid,
          total: data.pac + data.grid,
          day_energy: data.day_energy,
        },
      },
    ]);
    if (config.log) console.log('Wrote data to InfluxDB 1.x');
  };
} else {
  console.warn('No valid InfluxDB configuration provided.');
  writeData = async () => console.log('InfluxDB not configured');
}

// Meter-Logik (ohne axios, mit http)
const callApi = (path) => {
  return new Promise((resolve, reject) => {
    const url = `http://${config.meter.host}${path}`;
    if (config.log) console.log(`Calling ${url}`);
    
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          reject(new Error(`Failed to parse response from ${url}: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Error calling ${url}: ${err.message}`));
    });

    req.end();
  });
};

const getInverterData = async () => {
  const data = await callApi(froniusApi.GetInverterRealtimeData);
  return {
    pac: data.Body.Data.PAC.Values['1'],
    day_energy: data.Body.Data.DAY_ENERGY.Values['1'],
  };
};

const getGridData = async () => {
  const data = await callApi(froniusApi.GetMeterRealtimeData);
  return -data.Body.Data['0'].PowerReal_P_Sum; // Negativ, wie in der Original-App
};

// Hauptlogik
const logData = async () => {
  try {
    const inverterData = await getInverterData();
    const gridData = await getGridData();
    const data = {
      pac: inverterData.pac,
      grid: gridData,
      total: inverterData.pac + gridData,
      day_energy: inverterData.day_energy,
    };
    if (config.log) {
      console.log('Data:', data);
    }
    await writeData(data);
  } catch (err) {
    console.error('Error logging data:', err);
    if (influxClient && influxClient.ping) {
      console.log('Pinging InfluxDB...');
      influxClient.ping(5000).then(hosts => {
        hosts.forEach(host => {
          if (host.online) {
            console.log(`${host.url.host} responded in ${host.rtt}ms running ${host.version}`);
          } else {
            console.log(`${host.url.host} is offline`);
          }
        });
      });
    }
  }
};

// Cron-Job alle 10 Sekunden
setInterval(logData, 10000);

// Starte sofort einmal
logData();