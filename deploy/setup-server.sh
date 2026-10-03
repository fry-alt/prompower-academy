#!/usr/bin/env bash
# Разовая подготовка чистого сервера Ubuntu 22.04/24.04 под PROMPOWER Academy.
# Запускать от root:  bash setup-server.sh
# Ставит Docker, создаёт пользователя deploy (им заходит GitHub Actions),
# настраивает firewall. Повторный запуск безопасен.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите от root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 ufw unattended-upgrades
systemctl enable --now docker

# Пользователь для деплоя: те же SSH-ключи, что у root, и доступ к Docker.
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
install -d -m 750 -o deploy -g deploy /opt/prompower-academy

# Swap на маленьких серверах, чтобы обновления не падали по памяти.
if [ ! -f /swapfile ] && [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 2000 ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "Готово: Docker $(docker --version | awk '{print $3}' | tr -d ,), пользователь deploy, /opt/prompower-academy"
