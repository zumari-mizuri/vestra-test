# Set environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✓ Loaded environment variables from .env"
else
    echo "ERROR: .env file not found"
    exit 1
fi 


forge script script/DeployVestraManager.s.sol:DeployVestraManager \
    --rpc-url $HEDERA_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast \
    --verify \
    --verifier sourcify \
    --verifier-url https://server-verify.hashscan.io/api \
    -vvvv 