#!/bin/bash
# clear-ip.sh

IP=$1
CLASSID=$2

# Network interface
IFACE="wg0"
IFB_IFACE="ifb0"

# Belirtilen IP ve classid için oluşturulan filtreleri kaldır
sudo tc filter del dev $IFACE protocol ip parent 1: prio 1 u32 match ip src $IP flowid 1:${CLASSID} 2>/dev/null
sudo tc filter del dev $IFB_IFACE protocol ip parent 1: prio 1 u32 match ip dst $IP flowid 1:${CLASSID} 2>/dev/null

# Belirtilen classid için oluşturulan trafik sınıflarını kaldır
sudo tc class del dev $IFACE parent 1: classid 1:${CLASSID} 2>/dev/null
sudo tc class del dev $IFB_IFACE parent 1: classid 1:${CLASSID} 2>/dev/null
