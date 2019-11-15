var app = require('express')()
var server = require('http').Server(app)
var io = require('socket.io')(server)

var wpi = require('node-wiring-pi')
var Oled = require('./oled')
var font = require('oled-font-5x7')
var pngparse = require('pngparse')
var rsj = require('rsj')

wpi.setup('wpi')

var port = 3000

var clearLED = 25
var cloudLED = 1
var rainLED = 27

wpi.pinMode(clearLED, wpi.OUTPUT)
wpi.pinMode(cloudLED, wpi.OUTPUT)
wpi.pinMode(rainLED, wpi.OUTPUT)

var opts = {
	width:128,
	height:64,
	dcPin:23,
	rstPin:24
}

var oled = new Oled(opts)
var temp = 0
var wf = 'Clear'
var time = ''

var execSync = require('child_process').execSync
var loc = execSync('cat /home/pi/weather/loc').toString()
//'http://www.kma.go.kr/wid/queryDFSRSS.jsp?zone=1159068000'

server.listen(port, function(){
	console.log('server is running')
})

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html')
})

io.on('connection', function(socket){
	console.log('connection')
	io.emit('info', {'temp':temp, 'wf':wf, 'loc':loc, 'time':time})
	
	socket.on('update', function(data){
		console.log('update:', data)

		execSync('echo "'+ data.toString() +'" > /home/pi/weather/loc')
		loc = data.toString()
		checkWeather(loc)
	})
})

var updateIcon = function(wf){	
	if(wf == 'Clear')
		return '/home/pi/weather/icon/clear.png'
	if(wf.indexOf('Cloudy') != -1)
		return '/home/pi/weather/icon/cloud.png'
	if(wf.indexOf('Snow') != -1)
		return '/home/pi/weather/icon/snow.png'
	if(wf.indexOf('Rain') != -1)
		return '/home/pi/weather/icon/rain.png'
}

var checkWeather = function(loc){
  try{
	  rsj.r2j(loc, function(json){
		  var data = JSON.parse(json)

		  temp = parseInt(data[0]['rss:description'].body.data[0].temp['#'])
		  wf = data[0]['rss:description'].body.data[0].wfen['#']
      time = new Date().toLocaleString()
		  console.log(temp + '' + wf)
	    io.emit('info', {'temp':temp, 'wf':wf, 'loc':loc, 'time':time})

		  updateWeather()
	  })
	}
	catch(err){
	  io.emit('info', {'temp':temp, 'wf':wf, 'loc':'Location error', 'time':time})
	}
}

var updateWeather = function(){
	if(wf == 'Clear'){
		console.log('Clear')
		wpi.digitalWrite(clearLED, wpi.HIGH)
		wpi.digitalWrite(cloudLED, wpi.LOW)
		wpi.digitalWrite(rainLED, wpi.LOW)
	}
	if(wf.indexOf('Cloudy') != -1){
		console.log('Cloudy')
		wpi.digitalWrite(clearLED, wpi.LOW)
		wpi.digitalWrite(cloudLED, wpi.HIGH)
		wpi.digitalWrite(rainLED, wpi.LOW)
	}
	else{
		console.log('Snow/Rain')
		wpi.digitalWrite(clearLED, wpi.LOW)
		wpi.digitalWrite(cloudLED, wpi.LOW)
		wpi.digitalWrite(rainLED, wpi.HIGH)
	}

	weatherIcon = updateIcon(wf)
	pngparse.parseFile(weatherIcon, function(err, image){
		oled.drawBitmap(image.data)
		oled.setCursor(65, 3)
		oled.writeString(font, 1, wf, 1, true)
		oled.setCursor(70, 30)
		str = String(temp)+'℃'

		oled.writeString(font, 2, str, 1, true)
	})
}

oled.begin(function(){
	oled.clearDisplay()

	checkWeather(loc)

	setInterval(function(){
		var date = new Date()

		if((date.getMinutes() == 0) && (date.getSeconds() == 0)){
			console.log('check date : ' + date)

			oled.clearDisplay()
			checkWeather(loc)
		}
	}, 1000)
})


