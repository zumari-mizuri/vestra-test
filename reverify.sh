# Set environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ Loaded environment variables from .env"
else
    echo "ERROR: .env file not found"
    exit 1
fi 



 forge verify-contract \
    --chain-id 296 \
    --verifier sourcify \
    --constructor-args 0000000000000000000000000000000000000000000000000000000000000167 \
    0xe7086a39b97A2A81327D55264E1119F61000781d \
    src/VestraManager.sol:VestraManager