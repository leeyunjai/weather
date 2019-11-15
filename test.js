var rsj = require('rsj')
var execSync = require('child_process').execSync
var loc = execSync('cat /home/pi/weather/loc').toString()
	  rsj.r2j(loc, function(json){
		  var data = JSON.parse(json)

      console.log(data[0]['categories'][0])


		  temp = parseInt(data[0]['rss:description'].body.data[0].temp['#'])
		  wf = data[0]['rss:description'].body.data[0].wfen['#']
		});
