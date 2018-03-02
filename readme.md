# u-blox agps proxy

1. specify a geo list
2. when agps request received, find a nearest geo point in the geo list
3. replace the request with the nearest geo point
4. proxy the request to ublox agps server
5. cache the result in a certain period of time
