FROM python:3.12-slim
LABEL org.opencontainers.image.source="https://github.com/rmaneschy/agentskills"
LABEL org.opencontainers.image.description="Agent Skills CLI with the bundled skill pack"
LABEL org.opencontainers.image.licenses="MIT"
WORKDIR /src
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
COPY skills ./skills
RUN pip install --no-cache-dir . && rm -rf /src
WORKDIR /work
ENTRYPOINT ["agentskills"]
CMD ["--help"]
