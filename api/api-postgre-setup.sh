#!/bin/bash


PROJECT_PATH=$(cat /../project_path.txt)
if [ -z "$PROJECT_PATH" ]; then
    echo "Error: PROJECT_PATH is empty"
    exit 1
else
    echo "PROJECT_PATH is set to: $PROJECT_PATH"
fi

# Ana domaini tanımlayın
SERVER_DOMAIN=$(grep -w "SERVER_DOMAIN" /../environments.txt | cut -d '=' -f2)

if [[ -z "$SERVER_DOMAIN" ]]; then
    echo "SERVER_DOMAIN is not set or is empty."
    exit 1
fi

echo "Belirlenen tam domain: $SERVER_DOMAIN"

API_KEY=$(grep -w "API_KEY" /../environments.txt | cut -d '=' -f2)

if [[ -z "$API_KEY" ]]; then
    echo "API_KEY is not set or is empty."
    exit 1
fi

# WireGuard interface ve public keyini bul
SERVER_WG_INTERFACE="wg0"
SERVER_PUBKEY=$(wg show ${SERVER_WG_INTERFACE} public-key)

# SERVER_PORT sabit tanımlanır
SERVER_PORT=51630

# .env dosyası oluştur
ENV_PATH="$PROJECT_PATH/bozvpn-server/api/.env"

# Eğer dosya varsa sil
[ -f "$ENV_PATH" ] && rm "$ENV_PATH"

# PostgreSQL veritabanı bilgileri
DB_NAME="wireguard_xvpn"
DB_USER="wireguard_xuser"
DB_PASS="wireguard_xvpnpass"

# Yeni .env dosyası oluştur ve bilgileri yaz
{
  echo "API_KEY=\"$API_KEY\""
  echo "SERVER_WG_INTERFACE=\"$SERVER_WG_INTERFACE\""
  echo "SERVER_PUBKEY=\"$SERVER_PUBKEY\""
  echo "SERVER_PUBLIC_IP=\"$SERVER_DOMAIN\""
  echo "SERVER_PORT=\"$SERVER_PORT\""
  echo "CERTBOT_PRIVKEY_PATH=\"/etc/letsencrypt/live/$SERVER_DOMAIN/privkey.pem\""
  echo "CERTBOT_FULLCHAIN_PATH=\"/etc/letsencrypt/live/$SERVER_DOMAIN/fullchain.pem\""
  echo "SPEED_LIMITER_SH_PATH=\"$PROJECT_PATH/bozvpn-server/api/speed-limiter.sh\""
  echo "CLEAR_ALL_IP_SH_PATH=\"$PROJECT_PATH/bozvpn-server/api/clear-all-speed.sh\""
  echo "CLEAR_IP_SH_PATH=\"$PROJECT_PATH/bozvpn-server/api/clear-ip.sh\""
  echo "DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}\""
} > $ENV_PATH

# NPM ve Node.js kurulumu (Eğer daha önce kurulmadıysa)
sudo apt update
sudo apt install -y nodejs npm

# PostgreSQL APT deposunun eklenmesi ve kurulumu
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16

# PostgreSQL hizmetini başlatma
sudo systemctl start postgresql
sudo systemctl enable postgresql

# PostgreSQL veritabanı ve kullanıcı oluşturma
sudo -u postgres psql <<EOF
CREATE DATABASE ${DB_NAME};
CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASS}';
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

# PM2 global kurulum
sudo npm install -g pm2

# $PROJECT_PATH/bozvpn-server/api klasörü içindeki npm paketlerini kur
cd $PROJECT_PATH/bozvpn-server/api
npm init -y

# api için gerekli kütüphaneler
npm install express body-parser dotenv async-mutex pg

# Veritabanı tablo oluşturma ve temizleme
sudo -u postgres psql -d ${DB_NAME} <<EOF
DO \$\$
BEGIN
    -- Tablo mevcutsa tamamen kaldır
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        DROP TABLE users;
    END IF;
END
\$\$;

-- users tablosunu yeniden oluştur
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    device_id TEXT NOT NULL, -- Cihaz ID'si eklenir
    public_ip TEXT NOT NULL,
    public_key TEXT NOT NULL,
    wg_ip TEXT NOT NULL,
    download_total BIGINT DEFAULT 0,
    upload_total BIGINT DEFAULT 0,
    premium BOOLEAN DEFAULT FALSE,
    is_quota BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL, -- Başlangıçta NULL, 
    UNIQUE(device_id)
);


-- Veritabanı ve tablo sahipliğini güncelle
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
ALTER TABLE users OWNER TO ${DB_USER};
EOF


echo "Gerekli kurulumlar yapıldı."
echo -e "\033[0;32mBaşlatmak için 'sudo pm2 start' komutunu kullanın.\033[0m"

exit 0
