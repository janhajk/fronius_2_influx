var axios = require('axios').default;


const config = {
   meter: {
      host: process.env.APIOKEX_KEY,
   },
   log: process.env.LOG
};


var fronius_api = {
   GetSensorRealtimeData: '/solar_api/v1/GetSensorRealtimeData.cgi?Scope=System&DataCollection=NowSensorData',
   GetInverterRealtimeData: '/solar_api/v1/GetInverterRealtimeData.cgi?Scope=System',
   GetActiveDeviceInfo: '/solar_api/v1/GetActiveDeviceInfo.cgi?DeviceClass=System',
   GetMeterRealtimeData: '/solar_api/v1/GetMeterRealtimeData.cgi?Scope=System'
};



var Meter = function() {

   var call = function(path, cb) {
      var url = 'http://' + config.meter.host + '/' + path;
      axios.get(url)
         .then(function(response) {
            // handle success
            console.log(response.data.body);
            cb(null, response.data.body);
         })
         .catch(function(error) {
            // handle error
            console.log(error);
            cb(error);
         })
         .finally(function() {
            // always executed
         });


      // request(url, function(e, response, body) {
      //    if (e) {
      //       console.log('error in request ' + url);
      //       console.log(e);
      //       cb(e);
      //    }
      //    else {
      //       cb(null, response, body);
      //    }
      // });
   };

   this.getPAC = function(cb) {
      call(fronius_api.GetInverterRealtimeData, function(err, response, body) {
         if (config.log) {
            console.log('> IP ' + config.meter.host + '...');
         }
         var data = JSON.parse(body);
         cb(data.Body.Data.PAC.Values['1']);
      });
   };

   this.getInverter = function(cb) {
      call(fronius_api.GetInverterRealtimeData, function(err, body) {
         if (config.log) {
            console.log('> IP ' + config.meter.host + '...');
         }
         var data = JSON.parse(body);
         if (config.log) {
            console.log(data.Body.Data.DAY_ENERGY);
         }
         cb({ pac: data.Body.Data.PAC.Values['1'], day_energy: data.Body.Data.DAY_ENERGY.Values['1'] });
      });
   };

   this.getGrid = function(cb) {
      call(fronius_api.GetMeterRealtimeData, function(err, body) {
         var data = JSON.parse(body);
         if (config.log) {
            console.log(data.Body.Data['0']);
         }
         var p = data.Body.Data['0'].PowerReal_P_Sum;
         cb(p);
      });
   };

   this.getSparePower = function(cb) {
      this.getGrid(function(p) {
         p = -p;
         if (config.log) {
            console.log('Current Spare Power: ' + p + ' Watt');
         }
         cb(p);
      });
   };

};

module.exports = new Meter();
