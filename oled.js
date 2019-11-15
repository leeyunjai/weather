var spi = require('pi-spi');
var Gpio = require('onoff').Gpio;
var async = require('async');

var Oled = function(opts) {

  this.HEIGHT = opts.height || 32;
  this.WIDTH = opts.width || 128;
  this.dcPinNumber = opts.dcPin || 23;
  this.rstPinNumber = opts.rstPin || 24;
  this.device = opts.device || "/dev/spidev0.0";
  
  // create command buffers
  this.DISPLAY_OFF = 0xAE;
  this.DISPLAY_ON = 0xAF;
  this.SET_DISPLAY_CLOCK_DIV = 0xD5;
  this.SET_MULTIPLEX = 0xA8;
  this.SET_DISPLAY_OFFSET = 0xD3;
  this.SET_START_LINE = 0x00;
  this.CHARGE_PUMP = 0x8D;
  this.EXTERNAL_VCC = 0x1;
  this.MEMORY_MODE = 0x20;
  this.SEG_REMAP = 0xA1; // using 0xA0 will flip screen
  this.COM_SCAN_DEC = 0xC8;
  this.COM_SCAN_INC = 0xC0;
  this.SET_COM_PINS = 0xDA;
  this.SET_CONTRAST = 0x81;
  this.SET_PRECHARGE = 0xd9;
  this.SET_VCOM_DETECT = 0xDB;
  this.DISPLAY_ALL_ON_RESUME = 0xA4;
  this.NORMAL_DISPLAY = 0xA6;
  this.COLUMN_ADDR = 0x21;
  this.PAGE_ADDR = 0x22;
  this.INVERT_DISPLAY = 0xA7;
  this.ACTIVATE_SCROLL = 0x2F;
  this.DEACTIVATE_SCROLL = 0x2E;
  this.SET_VERTICAL_SCROLL_AREA = 0xA3;
  this.RIGHT_HORIZONTAL_SCROLL = 0x26;
  this.LEFT_HORIZONTAL_SCROLL = 0x27;
  this.VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL = 0x29;
  this.VERTICAL_AND_LEFT_HORIZONTAL_SCROLL = 0x2A;

  this.cursor_x = 0;
  this.cursor_y = 0;

  // new blank buffer
  this.buffer = new Buffer((this.WIDTH * this.HEIGHT) / 8);
  this.buffer.fill(0x00);

  this.previousBuffer = new Buffer((this.WIDTH * this.HEIGHT) / 8);
  this.previousBuffer.fill(0x00);
  this.updateInProgress = false;
  
  var config = {
    '128x32': {
      'multiplex': 0x1F,
      'compins': 0x02,
      'coloffset': 0
    },
    '128x64': {
      'multiplex': 0x3F,
      'compins': 0x12,
      'coloffset': 0
    },
    '96x16': {
      'multiplex': 0x0F,
      'compins': 0x2,
      'coloffset': 0,
    }
  };
  
  var screenSize = this.WIDTH + 'x' + this.HEIGHT;
  this.screenConfig = config[screenSize];
  
  // Setup transfer protocol
  this.wireSPI = spi.initialize(this.device);
}

Oled.prototype.begin = function(fn) {
  var that = this;
  this.dcPin = new Gpio(this.dcPinNumber, 'low');
  this.rstPin = new Gpio(this.rstPinNumber, 'high');
  setTimeout(function(){
    that.reset(function(){
      that._initialise(function(){
        if (typeof(fn) == "function") fn();
      });
  });
  }, 1);
}

Oled.prototype.end = function() {
  this.dcPin.unexport();
  this.rstPin.unexport();
}

Oled.prototype._initialise = function(fn) {

  // sequence of bytes to initialise with
  var initSeq = [
    this.DISPLAY_OFF,
    this.SET_DISPLAY_CLOCK_DIV, 0x80,
    this.SET_MULTIPLEX, this.screenConfig.multiplex, // set the last value dynamically based on screen size requirement
    this.SET_DISPLAY_OFFSET, 0x00, // sets offset pro to 0
    this.SET_START_LINE,
    this.CHARGE_PUMP, 0x14, // charge pump val
    this.MEMORY_MODE, 0x00, // 0x0 act like ks0108
    this.SEG_REMAP, // screen orientation
    this.COM_SCAN_DEC, // screen orientation change to INC to flip
    this.SET_COM_PINS, this.screenConfig.compins, // com pins val sets dynamically to match each screen size requirement
    this.SET_CONTRAST, 0x8F, // contrast val
    this.SET_PRECHARGE, 0xF1, // precharge val
    this.SET_VCOM_DETECT, 0x40, // vcom detect
    this.DISPLAY_ALL_ON_RESUME,
    this.NORMAL_DISPLAY,
    this.DISPLAY_ON
  ];
  
  // write init seq commands
  this._transferCommandSeq(initSeq, function(){
    if (typeof(fn) == "function") fn();
  });
}

Oled.prototype._transferCommandSeq = function(cmdSeq, fn) {
  this.wireSPI.write(new Buffer(cmdSeq), function(err, d) {
      if (err) console.error(err, d);
      if (typeof(fn) == "function") fn();
    });
}

Oled.prototype._transferData = function(data, fn) {
  var that = this;
  this.dcPin.write(1, function(err){
    that.wireSPI.write(data, function(err, d){
      if (err) console.error(err, d);
      that.dcPin.write(0, function(err){
        if (err) console.error(err);
        if (typeof(fn) == "function") fn();
      });
    });
  });
}

Oled.prototype.reset = function(fn) {
  var that = this;
  async.series([
    function(callback){
      that.rstPin.write(0,callback);
    },
    function(callback){
      setTimeout(callback, 10);
    },
    function(callback){
      that.rstPin.write(1,callback);
    }
  ], function(err){
    if (err) console.error(err);
    if (typeof(fn) == "function") fn();
  });
}

// set starting position of a text string on the oled
Oled.prototype.setCursor = function(x, y) {
  this.cursor_x = x;
  this.cursor_y = y;
}

// write text to the oled
Oled.prototype.writeString = function(font, size, string, color, wrap, sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;
  var wordArr = string.split(' '),
      len = wordArr.length,
      // start x offset at cursor pos
      offset = this.cursor_x,
      padding = 0, letspace = 1, leading = 2;

  // loop through words
  for (var w = 0; w < len; w += 1) {
    // put the word space back in
    wordArr[w] += ' ';
    var stringArr = wordArr[w].split(''),
        slen = stringArr.length,
        compare = (font.width * size * slen) + (size * (len -1));

    // wrap words if necessary
    if (wrap && len > 1 && (offset >= (this.WIDTH - compare)) ) {
      offset = 1;
      this.cursor_y += (font.height * size) + size + leading;
      this.setCursor(offset, this.cursor_y);
    }

    // loop through the array of each char to draw
    for (var i = 0; i < slen; i += 1) {
      // look up the position of the char, pull out the buffer slice
      var charBuf = this._findCharBuf(font, stringArr[i]);
      // read the bits in the bytes that make up the char
      var charBytes = this._readCharBytes(charBuf);
      // draw the entire character
      this._drawChar(charBytes, size, false);

      // calc new x position for the next char, add a touch of padding too if it's a non space char
      padding = (stringArr[i] === ' ') ? 0 : size + letspace;
      offset += (font.width * size) + padding;

      // wrap letters if necessary
      if (wrap && (offset >= (this.WIDTH - font.width - letspace))) {
        offset = 1;
        this.cursor_y += (font.height * size) + size + leading;
      }
      // set the 'cursor' for the next char to be drawn, then loop again for next char
      this.setCursor(offset, this.cursor_y);
    }
  }
  if (immed) {
    this.update();
  }
}

// draw an individual character to the screen
Oled.prototype._drawChar = function(byteArray, size, sync) {
  // take your positions...
  var x = this.cursor_x,
      y = this.cursor_y;

  // loop through the byte array containing the hexes for the char
  for (var i = 0; i < byteArray.length; i += 1) {
    for (var j = 0; j < 8; j += 1) {
      // pull color out
      var color = byteArray[i][j],
          xpos, ypos;
      // standard font size
      if (size === 1) {
        xpos = x + i;
        ypos = y + j;
        this.drawPixel([xpos, ypos, color], false);
      } else {
        // MATH! Calculating pixel size multiplier to primitively scale the font
        xpos = x + (i * size);
        ypos = y + (j * size);
        this.fillRect(xpos, ypos, size, size, color, false);
      }
    }
  }
}

// get character bytes from the supplied font object in order to send to framebuffer
Oled.prototype._readCharBytes = function(byteArray) {
  var bitArr = [],
      bitCharArr = [];
  // loop through each byte supplied for a char
  for (var i = 0; i < byteArray.length; i += 1) {
    // set current byte
    var byte = byteArray[i];
    // read each byte
    for (var j = 0; j < 8; j += 1) {
      // shift bits right until all are read
      var bit = byte >> j & 1;
      bitArr.push(bit);
    }
    // push to array containing flattened bit sequence
    bitCharArr.push(bitArr);
    // clear bits for next byte
    bitArr = [];
  }
  return bitCharArr;
}

// find where the character exists within the font object
Oled.prototype._findCharBuf = function(font, c) {
  // use the lookup array as a ref to find where the current char bytes start
  var cBufPos = font.lookup.indexOf(c) * font.width;
  // slice just the current char's bytes out of the fontData array and return
  var cBuf = font.fontData.slice(cBufPos, cBufPos + font.width);
  return cBuf;
}

// send the entire framebuffer to the oled
Oled.prototype.update = function() {
  // Exit if buffer has not changed since last update
  if (this.buffer.toString() === this.previousBuffer.toString()) {
    return;
  }
  
  // Exit if another update is in progress, update will be triggered afterwards
  if (this.updateInProgress) {
    return;
  }
  
  this.updateInProgress = true;
  
  // Store current buffer as reference
  this.previousBuffer = new Buffer (this.buffer);
  
  // set the start and endbyte locations for oled display update
  var displaySeq = [
      this.COLUMN_ADDR,
      this.screenConfig.coloffset,
      this.screenConfig.coloffset + this.WIDTH - 1, // column start and end address
      this.PAGE_ADDR, 0, (this.HEIGHT / 8) - 1 // page start and end address
  ];

  // send intro seq
  var that = this;
  this._transferCommandSeq(displaySeq, function(){
    // write buffer data
    that._transferData(that.buffer, function(){
      that.updateInProgress = false;
      that.update();
    });
  });
}

// send dim display command to oled
Oled.prototype.dimDisplay = function(bool) {
  var contrast;

  if (bool) {
    contrast = 0; // Dimmed display
  } else {
    contrast = 0xCF; // Bright display
  }
  this._transferCommandSeq([this.SET_CONTRAST, contrast]);
}

// turn oled off
Oled.prototype.turnOffDisplay = function() {
  this._transferCommandSeq([this.DISPLAY_OFF]);
}

// turn oled on
Oled.prototype.turnOnDisplay = function() {
  this._transferCommandSeq([this.DISPLAY_ON]);
}

// clear all pixels currently on the display
Oled.prototype.clearDisplay = function(sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;
  // write off pixels
  this.buffer.fill(0x00);
  if (immed) {
    this.update();
  }
}

// invert pixels on oled
Oled.prototype.invertDisplay = function(bool) {
  if (bool) {
    this._transferCommandSeq([this.INVERT_DISPLAY]); // inverted
  } else {
    this._transferCommandSeq([this.NORMAL_DISPLAY]); // non inverted
  }
}

// draw an image pixel array on the screen
Oled.prototype.drawBitmap = function(pixels, sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;
  var x, y;

  for (var i = 0; i < pixels.length; i++) {
    x = Math.floor(i % this.WIDTH);
    y = Math.floor(i / this.WIDTH);

    this.drawPixel([x, y, pixels[i]], false);
  }

  if (immed) {
    this.update();
  }
}

// draw one or many pixels on oled
Oled.prototype.drawPixel = function(pixels, sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;

  // handle lazy single pixel case
  if (typeof pixels[0] !== 'object') pixels = [pixels];

  pixels.forEach(function(el) {
    // return if the pixel is out of range
    var x = el[0], y = el[1], color = el[2];
    if (x > this.WIDTH || y > this.HEIGHT) return;

    // thanks, Martin Richards.
    // I wanna can this, this tool is for devs who get 0 indexes
    //x -= 1; y -=1;
    var byte = 0,
        page = Math.floor(y / 8),
        pageShift = 0x01 << (y - 8 * page);

    // is the pixel on the first row of the page?
    (page == 0) ? byte = x : byte = x + (this.WIDTH * page);

    // colors! Well, monochrome.
    if (color === 'BLACK' || color === 0) {
      this.buffer[byte] &= ~pageShift;
    }
    if (color === 'WHITE' || color > 0) {
      this.buffer[byte] |= pageShift;
    }

  }, this);

  if (immed) {
    this.update();
  }
}

// using Bresenham's line algorithm
Oled.prototype.drawLine = function(x0, y0, x1, y1, color, sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;

  var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1,
      dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1,
      err = (dx > dy ? dx : -dy) / 2;

  while (true) {
    this.drawPixel([x0, y0, color], false);

    if (x0 === x1 && y0 === y1) break;

    var e2 = err;

    if (e2 > -dx) {err -= dy; x0 += sx;}
    if (e2 < dy) {err += dx; y0 += sy;}
  }

  if (immed) {
    this.update();
  }
}

// draw a filled rectangle on the oled
Oled.prototype.fillRect = function(x, y, w, h, color, sync) {
  var immed = (typeof sync === 'undefined') ? true : sync;
  // one iteration for each column of the rectangle
  for (var i = x; i < x + w; i += 1) {
    // draws a vert line
    this.drawLine(i, y, i, y+h-1, color, false);
  }
  if (immed) {
    this.update();
  }
}

// activate scrolling for rows start through stop
Oled.prototype.startScroll = function(dir, start, stop) {
  var scrollHeader,
      cmdSeq = [];

  switch (dir) {
    case 'right':
      cmdSeq.push(this.RIGHT_HORIZONTAL_SCROLL); break;
    case 'left':
      cmdSeq.push(this.LEFT_HORIZONTAL_SCROLL); break;
    // TODO: left diag and right diag not working yet
    case 'left diagonal':
      cmdSeq.push(
        this.SET_VERTICAL_SCROLL_AREA, 0x00,
        this.VERTICAL_AND_LEFT_HORIZONTAL_SCROLL,
        this.HEIGHT
      );
      break;
    // TODO: left diag and right diag not working yet
    case 'right diagonal':
      cmdSeq.push(
        this.SET_VERTICAL_SCROLL_AREA, 0x00,
        this.VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL,
        this.HEIGHT
      );
      break;
  }

  cmdSeq.push(
    0x00, start,
    0x00, stop,
    // TODO: these need to change when diagonal
    0x00, 0xFF,
    this.ACTIVATE_SCROLL
  );
  this._transferCommandSeq(cmdSeq);
}

// stop scrolling display contents
Oled.prototype.stopScroll = function() {
  this._transferCommandSeq([this.DEACTIVATE_SCROLL]); // stahp
}

module.exports = Oled;
