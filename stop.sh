#!/bin/bash

APPSECRET="License-Server"

echo "🛑 Stopping DayZ API Launcher Auto Update..."

pm2 delete $APPSECRET 2>/dev/null

echo "✅ PM2 processes stopped."
