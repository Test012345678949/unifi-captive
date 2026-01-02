# unifi-captive
A Service for getting a RFC 8908 / 8910 compatible captive redirect for unifi guest portal

Problem: unifi controller makes a redirect for the first site opened by a client.

Many clients use to open test sites like:

captive.apple.com

gstatic.com/generate_204

if the answer is not correct the clients open the browser and the redirect begin.

Look for further information:

https://en.wikipedia.org/wiki/Captive_portal

What does this script do:

On a unifi server port 80 and 443 are not used.

The skript starts a server on port 80 redirecting to port 443 and there 
the API wait for telling the client:

Is the client authorizied for the internet and if not where the captive portal is.

---------------------------------------
# Preferences:

      Configurable DHCP Server with Option 114 / 160 (pfSense, OPNSense tested) 
      official TLS Certificate (no Selfcert)
      Server,virtuell machine, raspberry  with nodejs and unifi 

---------------------------------------
# Config for DHCP / DNS / Unifi

      You've got your domain:                    testdomain.com
      --> Good decision create a subdomain: wlan.testdomain.com

      Your Server is 192.168.0.200 --> Configure DNS wlan.testdomain.com is 192.168.0.200

      Save your tls certificate eg /opt/certificate/
      --> ca.pem  cert.pem  fullchain.pem  key.pem

      Upload the certificate to unifi:

      openssl pkcs12 -export -in /opt/certificate/fullchain.pem -inkey /opt/certificate/key.pem -out /opt/certificate/unifi.p12 -name unifi -password pass:aircontrolenterprise   
      sudo keytool -delete -alias unifi -keystore /var/lib/unifi/keystore -storepass aircontrolenterprise
      sudo keytool -importkeystore -deststorepass aircontrolenterprise -destkeypass aircontrolenterprise -destkeystore /var/lib/unifi/keystore -srckeystore /opt/certificate/unifi.p12 -srcstoretype PKCS12 -alias unifi  -srcstorepass aircontrolenterprise
      sudo service unifi restart 

      DHCP give the option:

      114    Text    https://wlan.testdomain.com
      160    Text    https://wlan.testdomain.com (not in use anymore, but I don't 160 so for compatible mode i set it like 114)

------------------------------------------


Here we go on a ubuntu:

1. Login to Unifi (wlan.testdomain.com:8443)
2. Make a user ( e.g captive / captive1234 )
3. login via ssh
4. sudo apt-get install nodejs
5. sudo mkdir /opt/captive
6. sudo nano /opt/captive/captive.js --> Copy captive.js
7. sudo nano /etc/systemd/system/unifi-captive.service --> Copy unifi-captive.service
8. sudo systemctl daemon-reload
9. sudo systemctl start unifi-captive

-----------------------------------------

Now 

Test: cat /var/log/

      2026-01-02T08:52:00.164Z 🔐 UniFi Login...
      2026-01-02T08:52:00.200Z 🔐 Captive API läuft auf Port 443
      2026-01-02T08:52:00.200Z ➡ HTTP Redirect auf HTTPS aktiv (Port 80)
      2026-01-02T08:52:00.541Z ✅ Login OK – Cookie erneuert
      2026-01-02T08:52:00.541Z 🟢 System bereit

Ok the system is runnung. 

      Now take firefox or edge and go to wlan.testdomain.com and a json shoud appear

      --> {"captive":true,"user-portal-url":"https://wlan.testdomain.com:8843/guest/s/default/#/"}

Now look in /var/log --> cat unifi-captive-list.log

      Datum Abruf: 2026-01-02T09:49:27.678Z

      Clients gesamt: 12
      Authorisiert: 6

      172.16.130.194 : iPhone : 92:97:b1:1f:97:67 : true
      172.16.130.238 : - : e2:eb:69:d0:2c:52 : true
      172.16.132.103 : tasmota-54774C-5964 : 08:f9:e0:54:77:4c : undefined
      172.16.130.232 : - : d6:e2:93:0f:71:46 : true
      172.16.132.105 : tasmota-368B41-2881 : dc:4f:22:36:8b:41 : undefined
      172.16.132.110 : tasmota-FC2BD5-3029 : bc:dd:c2:fc:2b:d5 : undefined
      172.16.130.215 : A56-von-Peter : 56:fb:a5:d4:26:d0 : true
      172.16.130.163 : - : b2:52:c6:f9:e0:0b : true
      172.16.130.203 : - : 4e:d0:23:90:9c:a1 : true
      172.16.132.112 : - : 10:09:f9:8f:00:02 : undefined
      172.16.130.197 : iPhone : ba:83:65:57:95:3f : true
      172.16.132.25 : - : 4c:6a:f6:b6:bd:d2 : undefined


And now.... if a client connect you'll see in the log:

      2026-01-02T08:52:00.541Z 🟢 System bereit
      2026-01-02T08:52:05.686Z 📊 Abfrage erfolgreich – 34 Clients aktiv, 12 authorisiert
      2026-01-02T08:52:05.690Z 📤 10.255.250.150 → captive=true                            ** Test from my browser --> Has to go to Captive Portal, cause not known by unifi
      2026-01-02T08:57:32.800Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert  
      2026-01-02T08:57:32.801Z 📤 172.16.130.238 → captive=true                            ** New client --> Has to go to captive
      2026-01-02T09:07:32.970Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert  
      2026-01-02T09:07:32.971Z 📤 172.16.130.238 → captive=false                           **Same client --> Registred yesterday, has not to fo to captive
      

ToDos if someone like it: Identify the UserID and take the "authorized till" date and output the seconds till then.
Maybe this will take down the client traffic, cause sometimes I see now:

      2026-01-02T09:21:38.272Z 📤 172.16.130.203 → captive=false
      2026-01-02T09:21:44.728Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert
      2026-01-02T09:21:44.729Z 📤 172.16.130.203 → captive=false
      2026-01-02T09:21:52.385Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert
      2026-01-02T09:21:52.385Z 📤 172.16.130.203 → captive=false
      2026-01-02T09:22:07.497Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert
      2026-01-02T09:22:07.498Z 📤 172.16.130.203 → captive=false
2026-01-02T09:22:18.619Z 📊 Abfrage erfolgreich – 33 Clients aktiv, 11 authorisiert
2026-01-02T09:22:18.620Z 📤 172.16.130.203 → captive=false
