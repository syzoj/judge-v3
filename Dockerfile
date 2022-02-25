FROM node:10-buster

# Download and extract Sandbox RootFS (as the first-step!)
COPY sandbox-rootfs-url.txt /
RUN apt-get update && \
    apt-get install -y wget && \
    wget -O /sandbox-rootfs.tar.xz "$(cat /sandbox-rootfs-url.txt)" && \
    tar xf /sandbox-rootfs.tar.xz -C /

# Install OS dependencies
RUN apt-get update && \
    apt-get install -y build-essential libboost-all-dev

WORKDIR /app

# Install NPM dependencies
COPY package.json yarn.lock ./
RUN yarn --frozen-lockfile

# Copy code and build
COPY . .
RUN yarn build

ENV NODE_ENV=production \
    SYZOJ_JUDGE_RUNNER_INSTANCE=runner \
    SYZOJ_JUDGE_SANDBOX_ROOTFS_PATH=/rootfs \
    SYZOJ_JUDGE_WORKING_DIRECTORY=/tmp/working \
    SYZOJ_JUDGE_BINARY_DIRECTORY=/tmp/binary \
    SYZOJ_JUDGE_TESTDATA_PATH=/app/testdata \
    SYZOJ_JUDGE_DO_NOT_USE_X32_ABI=true

VOLUME ["/app/config", "/app/testdata"]

COPY ./docker-entrypoint.sh /
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["daemon"]
