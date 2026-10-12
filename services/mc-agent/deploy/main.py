"""Entry point of the MC on Amazon Bedrock AgentCore Runtime (the zip's root; `entryPoint: ["main.py"]`).

The runtime contract wants POST /invocations and GET /ping on 0.0.0.0:8080. `BedrockAgentCoreApp.run()` binds
127.0.0.1 unless it detects Docker, so the host is explicit here. `mc_agent/app.py` uses relative imports, so it
cannot be the entry file itself. The runtime always runs the MC in-process: forwarding from inside the runtime
(MC_BACKEND=agentcore) would only call itself.
"""

from mc_agent.app import backend, serve

if __name__ == "__main__":
    if backend() != "local":
        raise SystemExit("the AgentCore runtime must run the MC itself: leave MC_BACKEND unset or set it to local")
    serve(host="0.0.0.0", port=8080)  # nosec B104 - required by the AgentCore Runtime service contract
