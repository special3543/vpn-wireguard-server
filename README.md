# WireGuard VPN Server API

A **VPN Server API** built on the **WireGuard protocol**. Designed for **Ubuntu** systems with customizable features.

<br /><br />

## Main Modules

- **WireGuard**
- **Node.js** and **NPM**
- **PostgreSQL**
- **Shell Scripts** and additional **Linux packages**

<br /><br />

## Features

- **Speed Limiter**: Implements speed limitations using the `tc` tool.  
- **Configurable Quotas**: Allows setting data usage quotas for clients.  
- **Premium Support**: Includes features for premium clients with customizable quota settings.  
- **Endpoints**:  
  - **/connect**: Handles client connection requests.  
  - **/clear**: Resets all VPN connections without reconfiguring the server or manually managing WireGuard.

<br /><br />

## Planned Features

- **Blacklist Support**: Add a feature to block specific users or IPs from accessing the VPN server.

<br /><br />

## Instructions Before Setup

**Edit environment.txt file**:<br />
$SERVER_DOMAIN: This variable is domain of server for VPN.<br />
$API_KEY: Add your API key.

<br /><br />

## How to Setup

Run the following commands in order:

```bash
git clone https://github.com/special3543/vpn-wireguard-server.git
cd 'vpn-wireguard-server' 
sudo bash deploy-all.sh
```
<br />


## Additional Notes

- Im developing this project still. So, dont be prejudiced.
- This setup uses PM2 for process management and logging. You can modify the code to use other tools or directly with Node.js if needed.
- **Important**: If you have any issues, you can reach to me directly. Any contribution will be helpful.<br /><br /><br />



