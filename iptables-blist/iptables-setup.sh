#!/bin/bash

if [ "$(id -u)" != "0" ]; then
    echo "Bu script root olarak çalıştırılmalıdır." 1>&2
    exit 1
fi
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

iptables -A INPUT -p tcp -m tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp -m tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp -m tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp -m tcp --dport 3000 -j ACCEPT

iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6
echo "iptables ve ip6tables kuralları kalıcı olarak kaydedildi."

sudo apt-get install -y net-tools iptables-persistent
sudo netfilter-persistent save
