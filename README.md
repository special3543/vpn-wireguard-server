# WireGuard VPN Server API

A **VPN Server API** built on the **WireGuard protocol**. Designed for **Ubuntu** systems with customizable features.

---

## Main Modules

- **WireGuard**
- **Node.js** and **NPM**
- **PostgreSQL**
- **NodeExporter** (Monitoring)
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

## Instructions Before Setup

**Edit environment.txt file**:
$MAIN_DOMAIN: This variable is domain of server for VPN.
$API_KEY: Add your API key.

---

## How to Setup (For Non-Ansible Users)

Run the following commands in order:

```bash
git clone https://github.com/special3543/vpn-wireguard-server.git
cd 'vpn-wireguard-server' 
sudo bash deploy-all.sh
```

---


## Additional Notes

- This setup uses PM2 for process management and logging. You can modify the code to use other tools or directly with Node.js if needed.
- **Important**: If you have any issues, you can reach to me directly. Any contribution will be helpful.



