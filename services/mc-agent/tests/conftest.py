"""Test setup: no network. mc.py warms the service up at import (a model call and Polly's DescribeVoices on a
background thread); the tests import it, so the warm-up stays off unless a test starts it with stubs."""

import os

os.environ.setdefault("MC_WARM", "0")
