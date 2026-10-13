#!/bin/bash
# On the box: every setup's mean luma and near-black share in all four venues (a laugh on), and the wide in the
# listen, preview and after states. Out: ~/luma/<venue>[-state].json and the frames.
cd "$(dirname "$0")"
mkdir -p ~/luma
for v in club openmic theatre arena; do
  timeout 600 node setupsheet.mjs http://localhost:8092/index.html $v ~/luma "2.0" > ~/luma/$v.log 2>&1
  for st in listen preview after; do
    mkdir -p ~/luma/$st
    ONLY=-1 timeout 400 node setupsheet.mjs http://localhost:8092/index.html $v ~/luma/$st "6" "&state=$st" > /dev/null 2>&1
  done
done
echo done > ~/luma/ALLDONE
