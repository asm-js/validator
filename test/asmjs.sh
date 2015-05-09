#!/bin/bash

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

VALID_FILES=${DIR}/valid/*.js

for f in $VALID_FILES
do
    ./bin/asmjs $f
    if [ $? -ne 0 ]; then
        exit 1
    fi
done

INVALID_FILES=${DIR}/invalid/*.js

for f in $INVALID_FILES
do
    ./bin/asmjs $f
    if [ $? -ne 1 ]; then
        exit 1
    fi
done
