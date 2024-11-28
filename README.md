# VPN WireGuard Server API

A **VPN Server API** built on the **WireGuard protocol**. Designed for **Ubuntu** systems with customizable features.

---

## Main Modules

- **WireGuard**
- **Node.js** and **NPM**
- **PostgreSQL**
- **NodeExporter** (Monitoring)
- **Prometheus** (Monitoring)
- **Certbot** (SSL Certificate Management)
- **Shell Scripts** and additional **Linux packages**

---

## Features

- **Speed Limiter**: Implements speed limitations using the `tc` tool.  
- **Configurable Quotas**: Allows setting data usage quotas for clients.  
- **Premium Support**: Includes features for premium clients with customizable quota settings.  
- **Endpoints**:  
  - **/connect**: Handles client connection requests.  
  - **/clear**: Resets all VPN connections without reconfiguring the server or manually managing WireGuard.

---

## Planned Features

- **Blacklist Support**: Add a feature to block specific users or IPs from accessing the VPN server.

---

## Instructions

The project files can be directly cloned and installed on a server.  
**Note:** The order of script execution is critical and may cause issues if not followed correctly.  
To avoid potential problems, Ansible playbooks have been included in the repository.  
You can either use **Ansible** for remote installation and multi-server management or install manually as described below.

---

## How to Setup (For Non-Ansible Users)

Run the following commands in order:

```bash
sudo bash /home/ubuntu/vpn-wireguard-server/iptables-blist/iptables-setup.sh
sudo bash /home/ubuntu/vpn-wireguard-server/wireguard/wireguard-setup.sh
sudo bash /home/ubuntu/vpn-wireguard-server/stats/stats-setup.sh
sudo bash /home/ubuntu/vpn-wireguard-server/api/api-postgre-setup.sh
sudo pm2 start /home/ubuntu/vpn-wireguard-server/api/api.js
sudo pm2 save
sudo pm2 startup
```

---


## Additional Notes

- This setup uses PM2 for process management and logging. You can modify the code to use other tools or directly with Node.js if needed.
- **Important**: This server setup is designed for scenarios where it is managed by a central server that collects and manages the scores of multiple servers. Using it without a domain or for other purposes may require additional customizations.



