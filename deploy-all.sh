PROJECT_PATH=$(realpath "$(dirname "$(realpath "$0")")")
echo "$PROJECT_PATH" > project_path.txt

if [ -z "$PROJECT_PATH" ]; then
    echo "Error: PROJECT_PATH is empty"
    exit 1
else
    echo "PROJECT_PATH is set to: $PROJECT_PATH"
fi


sudo bash ${PROJECT_PATH}/iptables-blist/iptables-setup.sh
sudo bash ${PROJECT_PATH}/wireguard/wireguard-setup.sh
sudo bash ${PROJECT_PATH}/api/api-postgre-setup.sh
sudo pm2 start ${PROJECT_PATH}/api/api.js
sudo pm2 save
sudo pm2 startup