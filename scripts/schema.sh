rm -rf ./schema/contracts
echo "Targets"
find ./contracts -maxdepth 1 -type d \( ! -wholename ../contracts \)
sleep 3

find ./contracts -maxdepth 1 -type d \( ! -wholename ../contracts \) -exec sh -c "cd '{}' && pwd && cargo schema" \;

echo "Schemas Generated. Copying..."

mkdir -p ./schema/contracts
find ./contracts -maxdepth 1 -type d \( ! -wholename ../contracts \) -exec bash -c "echo {} && cd '{}' && cp -r schema ../../schema/$(basename {})" \;

echo "Schemas done!"