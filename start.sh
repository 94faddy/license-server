#!/bin/bash

APPSECRET="License-Server"


echo "🛑 Stopping old PM2 processes if running..."
pm2 delete $APPSECRET 2>/dev/null

echo "🚀 Starting DayZ API Launcher Auto Update..."
pm2 start server.js --name "$APPSECRET"


echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ System started with PM2!"

echo -e "\n📜 Opening logs for $APPSECRET...\n"
pm2 logs $APPSECRET
