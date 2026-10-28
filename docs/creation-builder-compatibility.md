# Creation builder compatibility

Milestone 05.1 now implements the application creation pathway around these
existing payloads. See [the integration report](milestone-05.1.md) for factory
requirements, local verification, and the remaining deployed-compatibility gate.
The historical fixture-only scope described below does not describe the new
integration tests. Native initialization and governance evidence is recorded
separately in the supplied 04.1A–D verification workspace.

The fixture files under `test/fixtures/` independently specify the expected JSON
initializer for one Steward and for two approvals among three Stewards. Tests
compare the builder's object, serialized UTF-8 JSON, and base64 factory argument
against these static fixtures. They do **not** deserialize through the Rust DAO
contract or execute the factory.

The fixture shapes were checked against upstream `5434a59`:

- [DAO `new(config, policy)` and initial `auto_update: true`](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/lib.rs)
- [Policy, role, and vote policy JSON fields](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs)
- [Config JSON fields](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/types.rs)
- [Factory `create(name, args)`](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao-factory2/src/lib.rs)

**Pending before deployment:** Test these exact encoded arguments with the
unmodified upstream Rust contract at `5434a59`, including `VersionedPolicy`
deserialization, `new` initialization, role permissions, and 1-of-1 and 2-of-3
proposal outcomes. That requires Rust contract or sandbox setup beyond this
isolated TypeScript component. The fixture tests alone cannot prove contract
acceptance or execution behavior.
