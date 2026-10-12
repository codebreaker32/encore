"""SigV4 request signing for Bedrock's OpenAI-compatible endpoint (bedrock-mantle), as an httpx auth.

botocore resolves the credentials (env, profile, SSO, `aws login`, container or instance role) and
signs inside the process; nothing here prints, logs or stores a secret. `botocore[crt]` is a
dependency because the `aws login` credential provider needs it.
"""

from collections.abc import Generator

import boto3
import httpx
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials
from botocore.exceptions import NoCredentialsError

SERVICE = "bedrock"
# The headers SigV4 adds; only these are copied back onto the outgoing request.
_SIGNED = ("authorization", "x-amz-date", "x-amz-security-token", "x-amz-content-sha256")


class BedrockSigV4(httpx.Auth):
    """Signs every request (method, URL, host, content-type and body) with SigV4 for service `bedrock`."""

    requires_request_body = True

    def __init__(self, region: str, credentials: Credentials | None = None, service: str = SERVICE) -> None:
        self.region = region
        self.service = service
        self._credentials = credentials

    def __repr__(self) -> str:  # never show credentials, even in a traceback
        return f"BedrockSigV4(region={self.region!r}, service={self.service!r})"

    def _frozen(self):
        creds = self._credentials or boto3.Session().get_credentials()
        if creds is None:
            raise NoCredentialsError()  # the MC reports this as "no-credentials"
        self._credentials = creds  # refreshable credentials refresh themselves
        return creds.get_frozen_credentials()

    def sign(self, request: httpx.Request) -> httpx.Request:
        headers = {"host": request.url.netloc.decode()}
        if "content-type" in request.headers:
            headers["content-type"] = request.headers["content-type"]
        aws = AWSRequest(method=request.method, url=str(request.url), data=request.content or None, headers=headers)
        SigV4Auth(self._frozen(), self.service, self.region).add_auth(aws)
        for name in _SIGNED:
            value = aws.headers.get(name)
            if value is not None:
                request.headers[name] = value
        return request

    def auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response, None]:
        yield self.sign(request)
