FROM alpine/git:1.0.7

LABEL "com.github.actions.name"="Add & Commit"
LABEL "com.github.actions.description"="Add & commit files from a path directly from GitHub Actions"
LABEL "com.github.actions.icon"="git-commit"
LABEL "com.github.actions.color"="black"

LABEL "repository"="https://github.com/EndBug/add-and-commit"
LABEL "homepage"="https://github.com/EndBug/add-and-commit"
LABEL "maintainer"="Federico Grandi <fgrandi30@gmail.com>"

RUN apk add jq

COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["sh", "/entrypoint.sh"]
