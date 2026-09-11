use flatbuffers::FlatBufferBuilder;

// Wire slots from Microsoft's BaseContainerSpecification.fbs, SBOX version 0.1.0.
// Deprecated integrity_level retains slot 8. No external implementation is copied.
const VERSION: u16 = 4;
const APP_CONTAINER: u16 = 6;
const LEAST_PRIVILEGE: u16 = 14;
const CAPABILITIES: u16 = 16;
const READ_WRITE: u16 = 18;
const READ_ONLY: u16 = 20;
const NETWORK: u16 = 22;
const DENY: u16 = 26;
const ENDPOINT_DEFAULT: u16 = 4;
const NETWORK_EGRESS: u16 = 6;

/// Encodes the fixed SBOX contract used by the opt-in OS probe.
pub(super) fn encode(write: &[&str], read: &[&str], deny: &[&str]) -> Vec<u8> {
    encode_contract(write, read, deny, false)
}

/// Encodes the two-phase PSEC 1.0 contract with the same test path/network policy.
pub(super) fn encode_psec(write: &[&str], read: &[&str], deny: &[&str]) -> Vec<u8> {
    encode_contract(write, read, deny, true)
}

fn encode_contract(write: &[&str], read: &[&str], deny: &[&str], psec: bool) -> Vec<u8> {
    let mut builder = FlatBufferBuilder::new();
    let version = builder.create_string("0.1.0");
    let capabilities = builder.create_string("registryRead,lpacInstrumentation");
    let strings: Vec<_> = write
        .iter()
        .map(|path| builder.create_string(path))
        .collect();
    let write = builder.create_vector(&strings);
    let strings: Vec<_> = read
        .iter()
        .map(|path| builder.create_string(path))
        .collect();
    let read = builder.create_vector(&strings);
    let strings: Vec<_> = deny
        .iter()
        .map(|path| builder.create_string(path))
        .collect();
    let deny = builder.create_vector(&strings);
    let start = builder.start_table();
    builder.push_slot::<i8>(ENDPOINT_DEFAULT, 0, 0);
    let egress = builder.end_table(start);
    let start = builder.start_table();
    builder.push_slot_always(NETWORK_EGRESS, egress);
    let network = builder.end_table(start);
    let start = builder.start_table();
    if psec {
        // PSEC version is an inline {major:u16, minor:u16}, here 1.0 in LE.
        const VERSION_1_0: u32 = 1;
        const PSEC_CAPABILITIES: u16 = 6;
        const PSEC_WRITE: u16 = 12;
        const PSEC_READ: u16 = 14;
        const PSEC_DENY: u16 = 16;
        const PSEC_NETWORK: u16 = 18;
        builder.push_slot_always(VERSION, VERSION_1_0);
        builder.push_slot_always(PSEC_CAPABILITIES, capabilities);
        builder.push_slot_always(PSEC_WRITE, write);
        builder.push_slot_always(PSEC_READ, read);
        builder.push_slot_always(PSEC_DENY, deny);
        builder.push_slot_always(PSEC_NETWORK, network);
    } else {
        builder.push_slot_always(VERSION, version);
        builder.push_slot(APP_CONTAINER, true, false);
        builder.push_slot(LEAST_PRIVILEGE, true, false);
        builder.push_slot_always(CAPABILITIES, capabilities);
        builder.push_slot_always(READ_WRITE, write);
        builder.push_slot_always(READ_ONLY, read);
        builder.push_slot_always(DENY, deny);
        builder.push_slot_always(NETWORK, network);
    }
    let root = builder.end_table(start);
    builder.finish(root, Some(if psec { "PSEC" } else { "SBOX" }));
    builder.finished_data().to_vec()
}
