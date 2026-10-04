import { Section, Table } from './HelpParts'

/** English help (same sections as HelpKo). */
export function HelpEn(): JSX.Element {
  return (
    <>
      <Section id="layout" title="1. Layout">
        <Table
          rows={[
            ['Top', 'Port settings, Connect/Disconnect, signal lines (CTS/DSR/CD in, DTR/RTS out), Help, Quit'],
            ['Receive', 'Traffic log: ASCII / HEX / HEX+ASCII, Time, Len, packet framing, find, copy'],
            ['Macros', 'Send stored messages with one click. Drag the border above to resize'],
            ['Send', 'Type and send one line (ASCII/HEX, +CR/+LF). ↑/↓ for history'],
            ['Status bar', 'Connection, settings summary, Rx/Tx counters with activity LEDs, Config path, encoding, language, theme']
          ]}
        />
        <p>
          All settings, macros and R/R rules are saved to <code>Config-Terminal2.json</code> next to the executable as soon as they change
          and are loaded on start. If that folder is read-only, the user data folder is used (shown in the status bar).
        </p>
      </Section>

      <Section id="connect" title="2. Connecting">
        <ol>
          <li>Pick a COM port (device name shown, e.g. COM8 — Silicon Labs CP210x). ⟳ rescans.</li>
          <li>Pick a baud rate or type any value (custom). Non-standard values get an orange border.</li>
          <li>Set data bits / parity / stop bits / handshaking, then <b>Connect</b>.</li>
        </ol>
        <p>
          <b>LOOPBACK (demo)</b> echoes everything you send, for trying macros and R/R without a device.
        </p>
        <p>
          <b>Connection</b> switches from Serial to a network connection. The log, macros, R/R and charts work the same way for
          every connection type.
        </p>
        <Table
          rows={[
            ['TCP Client', 'Connects to a server at Remote IP and port. If the other side closes, it is logged and the connection ends'],
            ['TCP Server', 'Waits for clients on Bind IP (0.0.0.0 = all adapters) and port. Several clients may connect; sending goes to all of them, received lines start with [sender IP:port], and R/R replies only to the client that asked'],
            ['UDP', 'Receives on Local IP/port and sends to Remote IP/port. Broadcast sends to 255.255.255.255. One datagram is one packet']
          ]}
        />
        <p>
          The ▾ next to an address lists recently used addresses (20 per type). When you run several copies, say one server and one
          client, the title bar shows the connection type and address and the top bar is colored per type. The second copy shows
          <code>#2</code> in its title and keeps its settings in <code>Config-Terminal2-2.json</code> (copied from the first one at
          first start).
        </p>
      </Section>

      <Section id="frame" title="3. Packet framing">
        <Table
          head={['Mode', 'Behaviour', 'Use for']}
          rows={[
            ['Gap', 'A packet ends after N ms without data', 'Most devices (default 30 ms)'],
            ['Terminator', 'A packet ends at LF / CR / ETX', 'Line-based text (SCPI)'],
            ['Length', 'Start byte (e.g. 02) + length byte at a given offset', 'Binary packets containing 02/03/0D as data']
          ]}
        />
        <p>
          Example: <code>02 23 D2 00 … 42</code> — byte 1 (<code>23</code> = 35) is the total length → Length mode, start 02,
          position 1, adjust 0.
        </p>
      </Section>

      <Section id="receive" title="4. Receive view">
        <p>
          Time / Len prefixes, CR/LF break a line after every packet in ASCII view (HEX views always show one packet per line), TX shows sent data. Selecting text or scrolling up pauses
          auto-scroll; click the blue button to resume. Right-click: copy, copy data only, copy selected lines as HEX. Ctrl+F finds
          text or HEX sequences.
        </p>
      </Section>

      <Section id="input" title="5. Input notation">
        <Table
          head={['Mode', 'How', 'Example']}
          rows={[
            ['HEX', 'Two digits per byte, any spacing, any case', '02 05 D0 00 D0 = 0205D000D0'],
            ['ASCII', 'Text as typed; Korean in EUC-KR (or UTF-8)', 'TEST1234'],
            ['ASCII control', '<NAME> or <HH>, as shown in the receive view', '*IDN?<LF>, <STX>DATA<ETX>']
          ]}
        />
      </Section>

      <Section id="macro" title="6. Macros">
        <p>
          In the macro editor select a row, then use Add / Duplicate / Up / Down / Delete (Alt+↑/↓, Delete). Hex checkbox switches
          the message to HEX. Empty name = start of the message. Click the hotkey cell and press a key (F1–F12 alone, otherwise
          Ctrl/Alt combos). Interval &gt; 0 toggles periodic sending. <b>CS</b> sets checksum and trailer; the appended bytes are
          shown next to the message. Byte order: <code>message | checksum | trailer | CR | LF</code>.
        </p>
      </Section>

      <Section id="checksum" title="7. Checksum range">
        <pre>{`message:  02  05  D0  00
offset:   0   1   2   3      (from end: -4 -3 -2 -1)
XOR8, range 2 ~ -1  ->  D0 ^ 00 = D0   ->  02 05 D0 00 D0`}</pre>
        <p>
          Formats: Binary, ASCII hex (<code>38B5</code>), ASCII integer (<code>14517</code>, variable width) and ASCII integer
          zero-padded (<code>00001</code>, fixed width: 3 digits for 8-bit, 5 for CRC16, 10 for CRC32).
        </p>
      </Section>

      <Section id="rr" title="8. Request / Response">
        <p>
          When a received packet matches a rule's request pattern (whole packet), its response is sent. The first matching
          enabled rule wins. Use the match test box to check rules. Optional request checksum verification; <code>R[n]</code> in
          a HEX response copies byte n of the request.
        </p>
      </Section>

      <Section id="pattern" title="9. Request patterns">
        <Table
          head={['Mode', 'Token', 'Meaning']}
          rows={[
            ['HEX', '??', 'any one byte'],
            ['HEX', '*', 'any bytes (0+), anywhere'],
            ['ASCII', '{?} / {*}', 'any one char / any chars'],
            ['ASCII', '<LF> <CR> <STX> <0D>', 'that byte'],
            ['ASCII', '* ?', 'literal characters (SCPI)']
          ]}
        />
      </Section>

      <Section id="regex" title="10. Regular expressions">
        <p>
          JavaScript regex, tested as "contains" — anchor with <code>^</code> and <code>$</code>. Escape <code>* ? . ( ) [ ]</code>{' '}
          with a backslash. <code>\r \n \x02</code> match bytes.
        </p>
        <Table
          head={['Regex', 'Matches']}
          rows={[
            ['^\\*IDN\\?', '*IDN? at the start'],
            ['^\\*IDN\\?\\r?\\n$', '*IDN? followed by LF or CR LF'],
            ['^MEAS:(VOLT|CURR)\\?', 'MEAS:VOLT? or MEAS:CURR?'],
            ['^SET -?\\d+(\\.\\d+)?$', 'SET with a number'],
            ['\\?$', 'any query ending with ?'],
            ['^\\x02.{3}\\x03$', 'STX + 3 bytes + ETX']
          ]}
        />
      </Section>

      <Section id="chart" title="11. Real-time chart">
        <p>
          📈 Chart opens a separate window (movable to another monitor). In ⚙ Settings: packet filter (R/R pattern syntax), ASCII
          split (strip prefix + delimiter), a sample packet (right-click a received line → Use as chart sample) and the data items
          to extract (name, unit, delimited field / regex / byte offset, scale, add, bits, axis, colour, alarm limits). Zooming or panning
          fixes the view; Latest follows new data again.
        </p>
      </Section>

      <Section id="files" title="12. Files & logs">
        <p>
          File dialogs start in the last folder used. Macro / R/R / chart lists remember their file, show "modified", and ask before
          loading over unsaved edits; the previous list is copied to exe folder\backup. Save writes the current receive view to a text file.
        </p>
      </Section>

      <Section id="example" title="13. Walkthrough: 02 05 D0 00 D0">
        <p>
          COM8, 19200, 8N1 → Connect. Framing: Length, start 02, position 1. Macro "D0 요청" (F1): HEX <code>02 05 D0 00</code> +
          XOR8 range 2 ~ -1 → sends <code>02 05 D0 00 D0</code>.
        </p>
      </Section>

      <Section id="keys" title="14. Shortcuts">
        <Table
          rows={[
            ['Macro hotkeys', 'set in the macro editor'],
            ['Ctrl+F', 'find'],
            ['Ctrl+Del', 'clear receive view'],
            ['Esc', 'close dialog']
          ]}
        />
      </Section>

      <Section id="pins" title="15. DB9 pinout">
        <Table
          rows={[
            ['1 CD', 'Carrier Detect (IN)'],
            ['2 RX', 'Receive Data (IN)'],
            ['3 TX', 'Transmit Data (OUT)'],
            ['4 DTR', 'Data Terminal Ready (OUT)'],
            ['5 GND', 'Ground'],
            ['6 DSR', 'Data Set Ready (IN)'],
            ['7 RTS', 'Request To Send (OUT)'],
            ['8 CTS', 'Clear To Send (IN)']
          ]}
        />
      </Section>
    </>
  )
}
