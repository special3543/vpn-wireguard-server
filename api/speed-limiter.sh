#!/bin/bash
# speed-limiter.sh

IP=$1
CLASSID=$2
SPEED=$3

# Network interface
IFACE="wg0"
IFB_IFACE="ifb0"

# Mevcut qdisc'leri kontrol et ve yoksa ekle
QDISC_EXISTS=$(sudo tc qdisc show dev $IFACE | grep hfsc)
if [ -z "$QDISC_EXISTS" ]; then
    # Root qdisc'leri ekle
    sudo tc qdisc add dev $IFACE root handle 1: hfsc default 1 
    sudo tc qdisc add dev $IFB_IFACE root handle 1: hfsc default 1
    
    # IFB arayüzü için gelen trafiği yönlendir
    sudo tc qdisc add dev $IFACE handle ffff: ingress
    sudo tc filter add dev $IFACE parent ffff: protocol ip u32 match u32 0 0 action mirred egress redirect dev $IFB_IFACE
fi

# Giden trafiği sınırla (IFACE üzerinde)
sudo tc class replace dev $IFACE parent 1: classid 1:${CLASSID} hfsc sc rate $SPEED ul rate $SPEED
sudo tc filter replace dev $IFACE protocol ip parent 1: prio 1 u32 match ip src $IP flowid 1:${CLASSID}

# Gelen trafiği sınırla (IFB_IFACE üzerinde)
sudo tc class replace dev $IFB_IFACE parent 1: classid 1:${CLASSID} hfsc sc rate $SPEED ul rate $SPEED
sudo tc filter replace dev $IFB_IFACE protocol ip parent 1: prio 1 u32 match ip dst $IP flowid 1:${CLASSID}
