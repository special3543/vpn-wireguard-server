#!/bin/bash
# clear-ip-limit.sh

# Network interface
IFACE="wg0"
IFB_IFACE="ifb0"

# Trafik sınırlamalarını temizle
QDISC_EXISTS=$(sudo tc qdisc show dev $IFACE | grep hfsc)
if [ ! -z "$QDISC_EXISTS" ]; then
    sudo tc qdisc del dev $IFACE root
    sudo tc qdisc del dev $IFACE ingress
fi

QDISC_EXISTS_IFB=$(sudo tc qdisc show dev $IFB_IFACE | grep hfsc)
if [ ! -z "$QDISC_EXISTS_IFB" ]; then
    sudo tc qdisc del dev $IFB_IFACE root
fi
