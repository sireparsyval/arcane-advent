// Inventory snapshots are persisted JSON, not live Foundry models. JSON
// serialization also unwraps the proxies that structuredClone cannot copy.
export function inventorySource(value) {
    return JSON.parse(JSON.stringify(value));
}
