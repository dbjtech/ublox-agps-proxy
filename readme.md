# u-blox agps proxy

## intro

1. specify a geo list
2. when agps request received, find a nearest geo point in the geo list
3. replace the request with the nearest geo point
4. proxy the request to ublox agps server
5. cache the result in a certain period of time

## use with node

```
git clone https://github.com/dbjtech/ublox-agps-proxy
cd ublox-agps-proxy
npm i
node .
```

## use with docker

```
docker run -p 46434:46434 dbjtech/ublox-agps-proxy
```
