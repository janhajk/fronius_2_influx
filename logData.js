var meter = require(__dirname + '/meter.js');

const Influx = require("influx");

const config = {
      influxdb: {
            host: process.env.SQLHOST,
            port: process.env.SQLPORT,
            db: process.env.SQLDB,
            user: process.env.SQLUSER,
            password: process.env.SQLPSW,
      }
};


const influx = new Influx.InfluxDB({
      host: 'http://' + config.influxdb.host + ':' + config.influxdb.port,
      database: config.influxdb.db,
      username: config.influxdb.user,
      password: config.influxdb.password,

      schema: [{
            measurement: "powerdata",
            fields: {
                  pac: Influx.FieldType.FLOAT,
                  grid: Influx.FieldType.FLOAT,
                  total: Influx.FieldType.FLOAT,
                  day_energy: Influx.FieldType.FLOAT
            },
            tags: []
      }]
});


let writeData = function() {
      meter.getInverter(function(dataInverter) {
            meter.getGrid(function(grid) {
                  influx
                        .writePoints(
                              [{
                                    measurement: "powerdata",
                                    fields: {
                                          pac: dataInverter.pac,
                                          grid: grid,
                                          total: dataInverter.pac + grid,
                                          day_energy: dataInverter.day_energy
                                    }
                              }], {
                                    database: config.influxdb.db,
                                    precision: "s"
                              }
                        )
                        .catch(err => {
                              console.error("Error writing data to Influx.");
                              console.error(err);
                              influx.ping(5000).then(hosts => {
                                    hosts.forEach(host => {
                                          if (host.online) {
                                                console.log(`${host.url.host} responded in ${host.rtt}ms running ${host.version})`);
                                          }
                                          else {
                                                console.log(`${host.url.host} is offline :(`);
                                          }
                                    })
                              });
                        });
            });
      });
};
// influx.query('DROP SERIES FROM /.*/').then(results => {
//   console.log(results)
// })
setInterval(writeData, 10000);
