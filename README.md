$sudo vi /etc/rc.local

/etc/rc.local
=========================================
fi

#Added by user-start

cd /home/pi/weather

sudo node /home/pi/weather/index.js &

#Added by user-end

exit 0
=========================================
