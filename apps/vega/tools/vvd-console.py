#!/usr/bin/env python3
"""Send commands to the Vega Virtual Device's emulator console (Android emulator console on port 5554).

Usage: vvd-console.py 'screenrecord screenshot /dir' ['another command' ...]
The console needs the token in ~/.emulator_console_auth_token, written by the emulator on first start.
"""
import os
import socket
import sys
import time

PORT = int(os.environ.get('VVD_CONSOLE_PORT', '5554'))


def read(sock: socket.socket, wait: float = 0.6) -> str:
    time.sleep(wait)
    sock.settimeout(1.5)
    out = b''
    try:
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            out += chunk
    except OSError:
        pass
    return out.decode(errors='replace')


def main() -> int:
    token = open(os.path.expanduser('~/.emulator_console_auth_token')).read().strip()
    sock = socket.create_connection(('127.0.0.1', PORT), timeout=10)
    read(sock)
    failed = False
    for command in ['auth ' + token] + sys.argv[1:]:
        sock.sendall((command + '\n').encode())
        reply = read(sock).strip()
        if not command.startswith('auth '):
            print(reply)
        failed = failed or 'KO' in reply.split()
    sock.sendall(b'quit\n')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
