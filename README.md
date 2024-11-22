# Argon Contest Server

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A fast and scalable online competitive programming contest server powered by cloud native computing.

## Packages

This monorepo contains 5 packages.

### [@argoncs/api-server](https://www.npmjs.com/package/@argoncs/api-server)

This package contains the server portion of the contest platform. It interacts with the user and the judger.

### [@argoncs/upload-server](https://www.npmjs.com/package/@argoncs/upload-server)

Upload server that handles testcases.

### [@argoncs/judge-daemon](https://www.npmjs.com/package/@argoncs/judge-daemon)

This package contains the code to be used on judgers. It executes submissions in sandboxes and grade their outputs.

### [@argoncs/result-handler](https://www.npmjs.com/package/@argoncs/result-handler)

The result handler receives compiling and grading results from a message queue and then perform database updates.

### [@argoncs/types](https://www.npmjs.com/package/@argoncs/types)

Type and class definitions utilized by both the server and the judger. Not designed to be used as a standalone package.

### [@argoncs/common](https://www.npmjs.com/package/@argoncs/common)

Utilities and libraries used by both the server and the judger to interact with the infrastructure (such as DB and Object Storage).

## Contribution

TeamsCode is a student organization and this project is developed entirely by high school students. We developed this project with the hope that it can benefit the community while serving as TeamsCode's contest server.

We are looking for people to join our team! If you are a high school student and knows web development, please email us at [contact@teamscode.org](mailto:contact@teamscode.org) for more info!
