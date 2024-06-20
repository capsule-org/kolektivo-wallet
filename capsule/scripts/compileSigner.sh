#!/bin/bash
dir=$(pwd)
cd ../../go-sdk/signer/
gomobile bind -o signer.xcframework -target=ios
gomobile bind -o signer.aar -target=android
cd $dir
echo "COMPILED"
rm -rf signer.xcframework signer.aar
cp -R ../../go-sdk/signer/signer.xcframework .
cp ../../go-sdk/signer/signer.aar .
echo "COPIED"
cd signer.xcframework
for d in */ ; do
    echo "$d"
    cd "$d"/Signer.framework
    rm Headers Modules Resources Signer
    cp -R Versions/A/* .
    rm -rf Versions
    cd ../..
done

echo "FIXED"
