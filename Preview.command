#!/bin/zsh
cd -- "${0:A:h}"
exec /usr/bin/python3 scripts/serve.py --port 4173
