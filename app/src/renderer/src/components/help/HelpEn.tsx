import { Section, Table } from './HelpParts'

/** English help (same sections as HelpKo). */
export function HelpEn(): JSX.Element {
  return (
    <>
      <Section id="layout" title="1. Layout">
        <Table
          rows={[
            ['Top', 'Connect split button (▾ = connection type Serial / TCP Client / TCP Server / UDP, desktop shortcut), fields for that type, signal lines (Serial) or clients (TCP Server), Help, Quit'],
            ['Receive', 'Traffic log: ASCII / HEX / HEX+ASCII, Time, Len, CR/LF, TX, packet framing, find, copy all, ● LOG (file log), R/R, chart'],
            ['Macros', 'Send stored messages with one click. ▾/▸ hides or shows the pane; drag the border above to resize'],
            ['Send', 'Type and send one line (ASCII/HEX, CR/LF appended when checked). ↑/↓ for history. ▾ next to Send = send a file'],
            ['Status bar', 'Connection, summary, Rx/Tx counters with activity LEDs, config file path, encoding, language, theme']
          ]}
        />
        <p>
          All settings, macros and R/R rules are saved to <code>configTerminal.json</code> next to the executable as soon as they change
          and are loaded on start. If that folder is read-only, the user data folder is used (shown in the status bar). Dialogs (macro
          editor, R/R, help, file send …) can be moved inside the main window by dragging their title bar.
        </p>
      </Section>

      <Section id="connect" title="2. Connecting (Serial)">
        <ol>
          <li>Choose <b>Serial</b> with the <b>▾</b> on the right of the Connect button (the current type is shown under the button).</li>
          <li>Pick a COM port (device name shown, e.g. COM8 — Silicon Labs CP210x). ⟳ rescans.</li>
          <li>Pick a baud rate or type any value (custom). Non-standard values get an orange border.</li>
          <li>Set data bits / parity / stop bits / handshaking, then <b>Connect</b>. The button turns into a green <b>Disconnect</b>.</li>
        </ol>
        <Table
          rows={[
            ['CTS / DSR / CD', 'Input signals from the device (green = on)'],
            ['DTR / RTS', 'Output lines on/off (off by default: RTS switches RS-485 adapters to transmit)'],
            ['Unplugged', 'Removing a USB serial adapter is logged and the connection ends']
          ]}
        />
        <p>
          <b>LOOPBACK (demo)</b> echoes everything you send, for trying macros, R/R and charts without a device (R/R replies are not
          echoed back).
        </p>
      </Section>

      <Section id="network" title="3. Network (TCP Client · TCP Server · UDP)">
        <p>
          Choose the type with <b>▾</b> next to Connect; the top fields change to match. The log, macros, R/R, charts, file log and file
          send work the same for every type. The type and address cannot change while connected.
        </p>
        <Table
          head={['Type', 'Fields', 'Connect does']}
          rows={[
            ['TCP Client', 'Remote IP, Remote port', 'Connects to that server (fails after 5 s without answer). If the other side closes, it is logged and the connection ends'],
            ['TCP Server', 'Bind IP, Port', 'Starts listening on this PC. Several clients may connect; joins and leaves are logged'],
            ['UDP', 'Local IP, Local port, Remote IP, Remote port, Broadcast', 'Receives on the local port and sends to the remote address, no handshake']
          ]}
        />
        <h4>Addresses</h4>
        <ul>
          <li>
            <b>▾</b> next to an address: <b>Recent</b> (addresses that connected, 20 per type) and <b>This PC</b> (adapter IPs). Picking
            a recent one fills in the port too.
          </li>
          <li>
            <b>Bind IP / Local IP</b>: <code>0.0.0.0</code> = all adapters of this PC; pick an IP to use one adapter only. Use{' '}
            <code>127.0.0.1</code> to test on the same PC.
          </li>
          <li>UDP local port 0 picks any free port (when only sending).</li>
        </ul>
        <h4>TCP Server</h4>
        <ul>
          <li>The top right shows <b>N client(s)</b> and the send target: <b>Send to all</b> or one client (→ IP:port).</li>
          <li>If the chosen client leaves, the target goes back to all. With no client connected, nothing is sent and a note is logged.</li>
          <li>
            Received lines start with the sender, e.g. <code>[127.0.0.1:9760]</code>, and a new line starts when the sender changes. R/R
            replies go only to the client that asked.
          </li>
        </ul>
        <h4>UDP</h4>
        <ul>
          <li>One datagram is one packet (framing is not used). Received lines start with the sender <code>[IP:port]</code>.</li>
          <li>
            <b>Broadcast</b> sends to <code>255.255.255.255</code> (the whole local network) instead of the remote IP.
          </li>
        </ul>
        <h4>Common errors</h4>
        <Table
          head={['Log message', 'Cause / what to check']}
          rows={[
            ['connect ECONNREFUSED', 'No server is listening at that address and port. Did the server side press Connect (start) first? Same port?'],
            ['timeout (5s)', 'No answer. Check the IP, the network and the firewall'],
            ['EADDRINUSE', 'Another program (or another Terminal2 window) already uses that port'],
            ['EADDRNOTAVAIL', 'The Bind/Local IP does not belong to this PC'],
            ['No client connected; nothing sent', 'Nobody has connected to the TCP Server yet']
          ]}
        />
      </Section>

      <Section id="windows" title="4. Several windows · profiles">
        <p>You can run Terminal2.exe several times, e.g. one TCP Server and one TCP Client. To tell them apart:</p>
        <ul>
          <li>
            The <b>title bar</b> (and taskbar) shows type, address and state, e.g.{' '}
            <code>Terminal 2 #2 — [TCP Client] → 127.0.0.1:9000 · Connected</code>; a TCP Server shows its client count.
          </li>
          <li>
            The <b>Connect button color</b>: Serial blue, TCP Client teal, TCP Server orange, UDP purple. The type name in the status bar
            uses the same color.
          </li>
          <li>
            From the second window on, the title gets <code>#2</code>, <code>#3</code> … and settings go to{' '}
            <code>configTerminal-2.json</code> etc. (copied from the first window at first start). Numbers follow the launch order.
          </li>
        </ul>
        <h4>Profiles (always start with the same settings)</h4>
        <ol>
          <li>Set things up (connection type, address, macros …).</li>
          <li>
            While disconnected, ▾ next to Connect → <b>Desktop shortcut with these settings…</b>
          </li>
          <li>
            Enter a name (e.g. <code>server</code>) and <b>Create shortcut</b>. The settings are saved to{' '}
            <code>configTerminal-server.json</code> and a desktop shortcut <code>Terminal2 - server</code> (
            <code>Terminal2.exe --profile=server</code>) is created. An existing profile asks before overwriting.
          </li>
          <li>
            Windows started from it show <code>[server]</code> in the title and use that profile. A second one shows{' '}
            <code>[server] #2</code>.
          </li>
        </ol>
        <p>
          Profile names may use letters, digits, Korean, <code>_</code> and <code>-</code>, but not digits only. Shortcuts can only be
          made from the built Terminal2.exe.
        </p>
      </Section>

      <Section id="frame" title="5. Packet framing">
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

      <Section id="receive" title="6. Receive view">
        <p>
          Time / Len prefixes, CR/LF break a line after every packet in ASCII view (HEX views always show one packet per line), TX shows sent data. Selecting text or scrolling up pauses
          auto-scroll; click the blue button to resume. Right-click: copy, copy data only, copy selected lines as HEX. Ctrl+F finds
          text or HEX sequences.
        </p>
      </Section>

      <Section id="input" title="7. Input notation">
        <Table
          head={['Mode', 'How', 'Example']}
          rows={[
            ['HEX', 'Two digits per byte, any spacing, any case', '02 05 D0 00 D0 = 0205D000D0'],
            ['ASCII', 'Text as typed; Korean in EUC-KR (or UTF-8)', 'TEST1234'],
            ['ASCII control', '<NAME> or <HH>, as shown in the receive view', '*IDN?<LF>, <STX>DATA<ETX>']
          ]}
        />
      </Section>

      <Section id="macro" title="8. Macros">
        <p>
          In the macro editor select a row, then use Add / Duplicate / Up / Down / Delete (Alt+↑/↓, Delete). Hex checkbox switches
          the message to HEX. Empty name = start of the message. Click the hotkey cell and press a key (F1–F12 alone, otherwise
          Ctrl/Alt combos). Interval &gt; 0 toggles periodic sending. <b>CS</b> sets checksum and trailer; the appended bytes are
          shown next to the message. Byte order: <code>message | checksum | trailer | CR | LF</code>.
        </p>
      </Section>

      <Section id="checksum" title="9. Checksum range">
        <pre>{`message:  02  05  D0  00
offset:   0   1   2   3      (from end: -4 -3 -2 -1)
XOR8, range 2 ~ -1  ->  D0 ^ 00 = D0   ->  02 05 D0 00 D0`}</pre>
        <p>
          Formats: Binary, ASCII hex (<code>38B5</code>), ASCII integer (<code>14517</code>, variable width) and ASCII integer
          zero-padded (<code>00001</code>, fixed width: 3 digits for 8-bit, 5 for CRC16, 10 for CRC32).
        </p>
      </Section>

      <Section id="rr" title="10. Request / Response">
        <p>
          When a received packet matches a rule's request pattern (whole packet), its response is sent. The first matching
          enabled rule wins. Use the match test box to check rules. Optional request checksum verification; <code>R[n]</code> in
          a HEX response copies byte n of the request.
        </p>
      </Section>

      <Section id="pattern" title="11. Request patterns">
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

      <Section id="regex" title="12. Regular expressions">
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

      <Section id="chart" title="13. Real-time chart">
        <p>
          📈 Chart opens a separate window (movable to another monitor). In ⚙ Settings: packet filter (R/R pattern syntax), ASCII
          split (strip prefix + delimiter), a sample packet (right-click a received line → Use as chart sample) and the data items
          to extract (name, unit, delimited field / regex / byte offset, scale, add, bits, axis, colour, alarm limits). Zooming or panning
          fixes the view; Latest follows new data again.
        </p>
      </Section>

      <Section id="log" title="14. File log (● LOG)">
        <p>
          The receive view keeps only the last 5,000 entries. For long tests, turn on <b>● LOG</b> in the receive toolbar: every
          connection gets a new file with all traffic and messages (Tx is written even when TX is hidden on screen).
        </p>
        <Table
          head={['Shows', 'State']}
          rows={[
            ['Grey dot', 'Off (click to turn on)'],
            ['Red ring', 'On — starts writing when connected'],
            ['Red dot (blinks with traffic)', 'Writing to a file'],
            ['▾', 'Settings: on/off, current file and size, retention, open log folder, clean up now']
          ]}
        />
        <Table
          rows={[
            ['Folder', 'exe folder\\Log\\Serial, \\TcpClient, \\TcpServer, \\Udp (per connection type)'],
            ['File name', 'date_time_target.log, e.g. 2026-10-04_224029_0.0.0.0-9000.log, 2026-10-05_090000_COM3.log'],
            ['Size', 'Continues in _2, _3 … after 10MB'],
            ['Retention', 'Files older than N days are deleted when connecting (or with Clean up now). 0 = keep (default 30 days)'],
            ['Turning off', 'Closes the file for that connection, after the disconnect message is written']
          ]}
        />
        <p>Format (content follows the receive view mode ASCII / HEX / HEX+ASCII):</p>
        <pre>{`[22:40:29.226] — TCP Server 0.0.0.0:9000 started — waiting for clients —
[22:40:30.839] Rx( 10): [127.0.0.1:6239] hello log<CR>
[22:40:31.040] Rx(  5): [127.0.0.1:6239] <STX><DLE> <ETX><CR>
[22:40:32.695] Tx(  8): TEST1234
[22:40:45.675] — TCP Server 0.0.0.0:9000 closed —`}</pre>
        <p>
          To save just what is on screen once, use <b>right-click → Save</b> in the receive view (text file).
        </p>
      </Section>

      <Section id="filesend" title="15. Sending a file">
        <p>
          Click <b>▾</b> next to Send to open the file send dialog. Splits a file and sends it piece by piece at an interval — for feeding a list of commands
          or replaying a captured log. This dialog does not close on an outside click or Esc; only ✕, Cancel and Send close it.
        </p>
        <Table
          head={['Send as', 'Behaviour']}
          rows={[
            ['Lines', 'One line at a time. The file\'s line breaks (CR, LF, CRLF, mixed) only separate lines and are not sent'],
            ['Whole file at once', 'The file bytes as they are, in one write'],
            ['N-byte chunks', 'Pieces of the chosen size, one after another']
          ]}
        />
        <h4>Line options</h4>
        <Table
          rows={[
            ['As is (ASCII)', 'Sends the line bytes unchanged; Korean keeps the file\'s bytes (no re-encoding)'],
            ['Turn <CR>·<LF>·<STX>·<0D> into bytes', 'On by default: <CR>, <LF>, <STX>, <0D> … written as text in the file are sent as the real bytes. Same names as section 7; unknown <abc> stays text'],
            ['HEX text → bytes', 'Each line like "02 05 D0 00" becomes bytes; a bad line is reported with its number'],
            ['Skip lines', 'Lines starting with these strings are not sent. Comma separated (e.g. >, Rx); leading spaces ignored; Korean works. The preview shows "N line(s) skipped"'],
            ['Line ending', '— (none) / CR / LF / CRLF appended to each line'],
            ['Skip empty lines', 'Empty or blank lines are not sent']
          ]}
        />
        <Table
          rows={[
            ['Repeat', '1 = once, N = N times, 0 = until stopped. The interval also applies between rounds'],
            ['Interval', 'Time between pieces in ms; 0 = back to back']
          ]}
        />
        <h4>Example: replaying a terminal log with Tx and Rx lines</h4>
        <pre>{`File (<CR> is 4 characters of text; line breaks are a mix of CRLF/LF)
?FCR:007,42442<CR>
>FCR:007,F,254,432,0677,002,000,0,000,0,0,0,3,F,0,275,414,58526<CR>
?FCR:007,42442<CR>
...

Settings: Lines · As is (ASCII) · tags into bytes ✔ · Skip lines ">" · Line ending — · Skip empty ✔
Result: only "?FCR:007,42442" + 0D is sent per line (reply lines starting with ">" are skipped)`}</pre>
        <p>
          If the file already contains tags like <code>&lt;CR&gt;</code>, set the line ending to <b>— (none)</b>; CRLF would send CR twice.
        </p>
        <h4>Preview</h4>
        <ul>
          <li>Shows the number of pieces, total bytes, and the first 8 pieces exactly as they will be sent (bytes per line).</li>
          <li>
            A <b>colored badge</b> <span className="ctrl-sample">&lt;CR&gt;</span> is a real control byte (0D …). &lt;CR&gt; without a
            badge means the 4 characters are sent as text.
          </li>
          <li>Korean is displayed with the status bar encoding (EUC-KR / UTF-8); the file bytes are sent unchanged.</li>
        </ul>
        <p>
          While sending, the send bar shows a progress bar, <code>120/500</code>, the round and a <b>Stop</b> button. Sending stops if
          the connection drops; start, finish and stop are logged.
        </p>
      </Section>

      <Section id="files" title="16. Files & locations">
        <p>
          File dialogs start in the last folder used. Macro / R/R / chart lists remember their file, show "modified", and ask before
          loading over unsaved edits; the previous list is copied to exe folder\backup. Right-click → Save writes the current receive
          view to a text file.
        </p>
        <Table
          head={['File in the exe folder', 'Content']}
          rows={[
            ['configTerminal.json', 'All settings, macros, R/R, charts (saved on every change)'],
            ['configTerminal-2.json …', 'Settings of the second and later windows'],
            ['configTerminal-<profile>.json', 'Profile settings (--profile=<name>)'],
            ['configTerminal.bak.json', 'The original kept when the settings file was broken'],
            ['Log\\…', 'File logs'],
            ['backup\\…', 'Macro/R/R/chart lists from before loading']
          ]}
        />
        <p>
          If only an older <code>Config-Terminal2.json</code> (or <code>Config.json</code>) exists, it is read on the first start and
          saved as <code>configTerminal.json</code>. The old file is not deleted; you can remove it yourself.
        </p>
      </Section>

      <Section id="example" title="17. Walkthrough: 02 05 D0 00 D0">
        <p>
          COM8, 19200, 8N1 → Connect. Framing: Length, start 02, position 1. Macro "D0 요청" (F1): HEX <code>02 05 D0 00</code> +
          XOR8 range 2 ~ -1 → sends <code>02 05 D0 00 D0</code>.
        </p>
      </Section>

      <Section id="keys" title="18. Shortcuts">
        <Table
          rows={[
            ['Macro hotkeys', 'set in the macro editor'],
            ['Ctrl+F', 'find'],
            ['Ctrl+Del', 'clear receive view'],
            ['Esc', 'close dialog (the file send dialog closes only with ✕, Cancel or Send)'],
            ['Enter (send bar)', 'send']
          ]}
        />
      </Section>

      <Section id="pins" title="19. DB9 pinout">
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
