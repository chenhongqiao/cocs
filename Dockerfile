FROM --platform=linux/arm64 node:22

WORKDIR /opt

COPY ./ ./argon

RUN apt-get update
RUN apt-get install -y  git
RUN apt-get install -y libcap-dev
RUN apt-get install -y libsystemd-dev
RUN apt-get install -y gcc
RUN apt-get install -y make
RUN apt-get install -y vim

RUN git clone https://github.com/ioi/isolate.git

WORKDIR /opt/isolate

RUN make isolate
RUN make install

WORKDIR /opt/argon

RUN yarn

WORKDIR /opt/argon/packages/judge-daemon
