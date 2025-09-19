#!/bin/bash

# Script de nettoyage des fichiers de test
# Usage: ./scripts/cleanup-test-files.sh

echo "🧹 Cleaning up test files..."

# Liste des fichiers de test créés
TEST_FILES=(
    "scripts/test-email-tracking.ts"
    "scripts/test-api-endpoints.ts"
    "scripts/email-tracking-demo.md"
    "scripts/cleanup-test-files.sh"
)

echo "📋 Test files to remove:"
for file in "${TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "   ✓ $file (exists)"
    else
        echo "   ✗ $file (not found)"
    fi
done

echo ""
read -p "🗑️  Remove all test files? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Removing test files..."
    for file in "${TEST_FILES[@]}"; do
        if [ -f "$file" ]; then
            rm "$file"
            echo "   ✓ Removed $file"
        fi
    done
    echo "✅ Cleanup completed!"
else
    echo "❌ Cleanup cancelled"
fi