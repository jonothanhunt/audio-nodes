export interface ParsedMidi {
    status: number;
    typeHigh: number;
    isChannelMsg: boolean;
    channel: number | null;
    label: string;
    cmd: number;
    note: number;
    velocity: number;
}

export function parseMidiMessage(bytes: Uint8Array | number[]): ParsedMidi | null {
    if (!bytes || bytes.length < 1) return null;
    const status = bytes[0] & 0xff;
    const typeHigh = status & 0xf0;
    const isChannelMsg = typeHigh >= 0x80 && typeHigh <= 0xe0;
    const channel = isChannelMsg ? (status & 0x0f) + 1 : null;
    let label = "";
    switch (typeHigh) {
        case 0x80: label = "NoteOff"; break;
        case 0x90: label = (bytes[2] ?? 0) === 0 ? "NoteOff" : "NoteOn"; break;
        case 0xa0: label = "PolyAT"; break;
        case 0xb0: label = "CC"; break;
        case 0xc0: label = "Prog"; break;
        case 0xd0: label = "ChAT"; break;
        case 0xe0: label = "Pitch"; break;
        default:
            if (status === 0xf8) label = "Clock";
            else if (status === 0xfa) label = "Start";
            else if (status === 0xfc) label = "Stop";
            else label = `0x${status.toString(16)}`;
    }
    const cmd = status & 0xf0;
    const note = bytes.length > 1 ? bytes[1] & 0x7f : 0;
    const velocity = bytes.length > 2 ? bytes[2] & 0x7f : 0;
    return { status, typeHigh, isChannelMsg, channel, label, cmd, note, velocity };
}
