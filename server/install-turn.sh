#!/bin/bash
# ============================================================================
#  Install coturn (STUN/TURN) so online 2-player works across different
#  networks (mobile data <-> wifi). Without this, peers behind NAT/CGNAT
#  can exchange codes but never connect.
#  Usage:  bash install-turn.sh
# ============================================================================
set -e
IP="$(curl -s --max-time 10 https://api.ipify.org || hostname -I | awk '{print $1}')"
USER_NAME="pasur11"
PASS="Pasur11Turn2026"

echo "======================================"
echo " Installing TURN server on $IP"
echo "======================================"

echo "[1/4] Installing coturn..."
apt-get update -y -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq coturn

echo "[2/4] Writing config..."
cat >/etc/turnserver.conf <<CONF
listening-port=3478
fingerprint
lt-cred-mech
user=$USER_NAME:$PASS
realm=pasur11
external-ip=$IP
min-port=49160
max-port=49200
no-tls
no-dtls
no-cli
no-multicast-peers
CONF

sed -i 's/^#*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || \
  echo "TURNSERVER_ENABLED=1" >> /etc/default/coturn

echo "[3/4] Opening firewall ports..."
ufw allow 3478/tcp  >/dev/null 2>&1 || true
ufw allow 3478/udp  >/dev/null 2>&1 || true
ufw allow 49160:49200/udp >/dev/null 2>&1 || true

echo "[4/4] Starting service..."
systemctl enable coturn >/dev/null 2>&1 || true
systemctl restart coturn
sleep 2

if systemctl is-active --quiet coturn; then
  echo ""
  echo "======================================"
  echo " SUCCESS - TURN server is running"
  echo ""
  echo " Server:   turn:$IP:3478"
  echo " User:     $USER_NAME"
  echo " Password: $PASS"
  echo ""
  echo " IMPORTANT: in the ParsPack panel firewall, add these"
  echo " INBOUND rules (otherwise it stays blocked):"
  echo "    TCP 3478          allow"
  echo "    UDP 3478          allow"
  echo "    UDP 49160-49200   allow"
  echo "======================================"
else
  echo "FAIL - coturn did not start. Logs:"
  journalctl -u coturn -n 20 --no-pager 2>/dev/null | tail -20
fi
