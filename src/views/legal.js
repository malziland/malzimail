// Legal pages (Impressum / Datenschutz / Nutzungsbedingungen), settings-driven.
import { htmlShell, escape } from './layout.js';

// ---------- Legal pages ----------

const COMPANY = {
  name: 'malziland - learning | training | consulting e.U.',
  owner: 'Christoph Krieger',
  street: 'Tassilostraße 22',
  city: '4501 Neuhofen an der Krems',
  country: 'Österreich',
  email: 'info@malziland.at',
  emailPrivacy: 'info@malziland.at',
  gisa: '33320410',
  uid: 'ATU76410108',
  fn: '549939 i',
  court: 'Landesgericht Linz',
  wko: 'Oberösterreich',
  authority: 'BH Linz-Land',
  trade: 'Unternehmensberater einschließlich der Unternehmensorganisation, eingeschränkt auf Personalentwicklung'
};

// Resolves the legal context into the exact fields the templates need.
// ctx comes from getLegalContext(env): configured:false → use COMPANY defaults
// (e.g. production), configured:true → use only the operator's own data and
// omit the Austrian registry section entirely.
function resolveLegal(ctx) {
  ctx = ctx || { configured: false };
  const lifetimeHours = (ctx && ctx.lifetimeHours) || 48;
  const googleActive = !!(ctx && ctx.googleActive);
  if (!ctx.configured) {
    return {
      serviceName: 'malziMAIL',
      mailDomain: ctx.mailDomain,
      name: COMPANY.name, owner: COMPANY.owner,
      street: COMPANY.street, zip: '', city: COMPANY.city, country: COMPANY.country,
      email: COMPANY.email, emailPrivacy: COMPANY.emailPrivacy,
      legalDate: '27. Mai 2026',
      registry: COMPANY,
      lifetimeHours,
      googleActive,
    };
  }
  const cityLine = [ctx.zip, ctx.city].filter(Boolean).join(' ');
  return {
    serviceName: ctx.serviceName,
    mailDomain: ctx.mailDomain,
    // Headline = company if given (a sole proprietor's firm), otherwise the person.
    name: ctx.company || ctx.owner, owner: ctx.owner,
    street: ctx.street, zip: ctx.zip, city: cityLine, country: ctx.country || 'Österreich',
    email: ctx.email, emailPrivacy: ctx.email,
    legalDate: ctx.legalDate || '',
    registry: null, // operator-provided instances do not show foreign AT registry numbers
    lifetimeHours,
    googleActive,
  };
}

export function renderImpressum(ctx) {
  const c = resolveLegal(ctx);
  const stand = c.legalDate ? ` · Stand: ${escape(c.legalDate)}` : '';
  const body = `
  <a class="back-link" href="/">&larr; Zurück zur Startseite</a>
  <h1>Impressum</h1>
  <p class="legal__subtitle">Impressum – ${escape(c.serviceName)}${stand}</p>

  <div class="legal__block legal__highlight">
    <p><strong>${escape(c.serviceName)}</strong> ist ein interner Mail-Dienst für Bildungs-Workshops und Schulungen. Der Zugang läuft ausschließlich über einen persönlichen Workshop-Link – der Dienst ist nicht öffentlich nutzbar.</p>
  </div>

  <section>
    <h2>Diensteanbieter</h2>
    <div class="legal__block">
      <p><strong>${escape(c.name)}</strong></p>
      ${c.name !== c.owner ? `<p>Inhaber: ${escape(c.owner)}</p>` : ''}
      <p>${escape(c.street)}, ${escape(c.city)}, ${escape(c.country)}</p>
      <p><a href="mailto:${escape(c.email)}">${escape(c.email)}</a></p>
    </div>
  </section>
  ${c.registry ? `
  <section>
    <h2>Unternehmensdaten</h2>
    <div class="legal__block">
      <p>Gewerbewortlaut: ${escape(c.registry.trade)}</p>
      <p>GISA: ${escape(c.registry.gisa)} &middot; UID: ${escape(c.registry.uid)}</p>
      <p>FN: ${escape(c.registry.fn)} &middot; Firmenbuchgericht: ${escape(c.registry.court)}</p>
      <p>WKO: ${escape(c.registry.wko)} &middot; Gewerbebehörde: ${escape(c.registry.authority)}</p>
    </div>
  </section>` : ''}

  <section>
    <h2>Zweck dieses Online-Angebots</h2>
    <p>Bereitstellung und Betrieb von <strong>${escape(c.serviceName)}</strong> – einem temporären Mail-Service für Bildungs-Workshops, mit dem Teilnehmer:innen sich kurzzeitig bei externen Diensten registrieren können, ohne ihre echte Mail-Adresse preiszugeben. Adressen laufen automatisch spätestens nach ${c.lifetimeHours} Stunden ab — oft früher, sobald die Workshop-Leitung den Workshop beendet.</p>
  </section>

  <section>
    <h2>Verantwortlich für den Inhalt</h2>
    <p>${escape(c.owner)}, Anschrift wie oben.</p>
  </section>
  `;
  return htmlShell('Impressum – ' + c.serviceName, body, { legal: true });
}

export function renderDatenschutz(ctx) {
  const c = resolveLegal(ctx);
  const stand = c.legalDate ? ` · Stand: ${escape(c.legalDate)}` : '';
  const body = `
  <a class="back-link" href="/">&larr; Zurück zur Startseite</a>
  <h1>Datenschutz</h1>
  <p class="legal__subtitle">Verständlich erklärt${stand}</p>

  <div class="legal__block legal__highlight">
    <p><strong>${escape(c.serviceName)}</strong> ist ein interner Mail-Dienst für Bildungs-Workshops. Empfangene Mails werden ausschließlich auf Cloudflare-Infrastruktur in der EU verarbeitet und spätestens nach ${c.lifetimeHours} Stunden automatisch gelöscht — früher, sobald die Workshop-Leitung den Workshop beendet.</p>
  </div>

  <section>
    <h2>Verantwortlicher</h2>
    <p>${escape(c.name)}, Inhaber ${escape(c.owner)}. Alle Kontaktdaten findest du im <a href="/impressum">Impressum</a>.</p>
    <p>Datenschutz-Kontakt: <a href="mailto:${escape(c.emailPrivacy)}">${escape(c.emailPrivacy)}</a></p>
  </section>

  <section>
    <h2>Was passiert konkret?</h2>
    <ol>
      <li><strong>Du öffnest einen Workshop-Link.</strong> Dein Browser bekommt eine zufällige Mail-Adresse zugewiesen (z.B. <code>ws-abc12345@${escape(c.mailDomain)}</code>). Diese Adresse wird zusammen mit einem Zeitstempel auf einem Cloudflare-Server in der EU gespeichert. Keine IP-Adresse, kein Name, kein sonstiger Personenbezug.</li>
      <li><strong>Du nutzt die Adresse bei einem externen Dienst.</strong> Was du dort tust, liegt außerhalb des Verantwortungsbereichs von malziMAIL.</li>
      <li><strong>Mails kommen an.</strong> Cloudflare Email Routing nimmt eingehende Mails an deine temporäre Adresse entgegen und übergibt sie an einen Cloudflare Worker. Der Worker parst Absender, Betreff, Text- und HTML-Inhalt und speichert sie in einer Cloudflare D1-Datenbank (EU). Die Roh-Mail selbst wird nicht gespeichert.</li>
      <li><strong>Dein Browser zeigt die Mails an.</strong> Über kurze Server-Anfragen wird der Posteingang im Browser dargestellt. HTML-Mails werden in einem isolierten iframe gerendert, damit eingebettete Skripte keinen Zugriff auf die Hauptseite haben.</li>
      <li><strong>Spätestens nach ${c.lifetimeHours} Stunden ist Schluss</strong> – früher, sobald die Workshop-Leitung den Workshop beendet. Die Adresse ist dann abgelaufen, der Posteingang nicht mehr abrufbar, der zugehörige Eintrag wird zu Statistik-Zwecken anonym behalten (nur die Adresse + Zeitstempel, damit dieselbe Adresse nie ein zweites Mal vergeben wird).</li>
    </ol>
  </section>

  <section>
    <h2>Was bei uns nicht existiert</h2>
    <div class="legal__block legal__highlight">
      <ul>
        <li><strong>Kein ${escape(c.serviceName)}-Konto</strong> – kein selbst gewähltes Passwort, keine separate Anmeldung beim Mail-Dienst.${c.googleActive ? ' Deine temporäre Adresse ist zugleich dein <strong>Wegwerf-Google-Login</strong> für Gemini/NotebookLM – siehe „Wer ist beteiligt?".' : ''}</li>
        <li><strong>Kein Tracking</strong> – kein Analytics, kein Facebook Pixel, kein Google Tag Manager.</li>
        <li><strong>Keine Tracking-Cookies</strong> – nur ein technisch notwendiges Sitzungs-Cookie (<code>mzm_t</code>, dein Workshop-Zugang; im Admin-Bereich zusätzlich <code>mzm_admin</code>) und ein <code>localStorage</code>-Eintrag mit der zuletzt verwendeten Adresse. Beides verlässt dein Gerät nicht.</li>
        <li><strong>Keine IP-Adressen dauerhaft</strong> – Cloudflare verarbeitet IP-Adressen für den Verbindungsaufbau, speichert sie aber nicht dauerhaft in unserem Anwendungsdatenbestand.</li>
        <li><strong>Kein Personenbezug zu Adressen</strong> – wir wissen nicht, wer welche Adresse benutzt hat.</li>
        <li><strong>Keine Mails länger als ${c.lifetimeHours} Stunden</strong> – oft kürzer; nach Workshop-Ende bzw. Ablauf nicht mehr abrufbar.</li>
        <li><strong>Keine Werbung, kein Datenverkauf, kein Mail-Inhalt-Analyse.</strong></li>
      </ul>
    </div>
  </section>

  <section>
    <h2>Wer ist beteiligt?</h2>
    <table>
      <thead>
        <tr><th>Dienst</th><th>Was er bekommt</th><th>Betreiber</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Cloudflare Email Routing</td>
          <td>Eingehende Mails an <code>*@${escape(c.mailDomain)}</code>, kurz im Speicher zur Weitergabe an den Worker. Keine dauerhafte Speicherung durch Cloudflare selbst.</td>
          <td>Cloudflare, Inc., über DPA an EU-Rechenzentren</td>
        </tr>
        <tr>
          <td>Cloudflare Workers</td>
          <td>Verarbeitet eingehende Mails, parst MIME-Inhalte, schreibt in die D1-Datenbank. Code läuft in der nächstgelegenen Cloudflare-Edge-Region.</td>
          <td>Cloudflare, Inc.</td>
        </tr>
        <tr>
          <td>Cloudflare D1 (Datenbank)</td>
          <td>Speichert vergebene Adressen (mit Zeitstempel, ohne IP/Name) und empfangene Mails (Absender, Betreff, Inhalt). Standort: EU.</td>
          <td>Cloudflare, Inc.</td>
        </tr>
        <tr>
          <td>Cloudflare DNS</td>
          <td>Auflösung der Domain ${escape(c.mailDomain)}. Standard-DNS-Anfragen.</td>
          <td>Cloudflare, Inc.</td>
        </tr>${c.googleActive ? `
        <tr>
          <td>Google Cloud Identity / Admin SDK</td>
          <td>Pro Teilnehmer:in wird ein <strong>temporäres Google-Konto</strong> angelegt (Login = die temporäre Adresse, plus Passwort). An Google übermittelt werden Login, Anzeigename und Passwort. Das Konto wird gemeinsam mit dem Postfach bei Ablauf bzw. Workshop-Stopp automatisch gelöscht.</td>
          <td>Google LLC (USA) – Drittlandtransfer, siehe „Das Rechtliche"</td>
        </tr>` : ''}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Das Rechtliche</h2>
    <p>Die Verarbeitung empfangener Mails erfolgt auf Grundlage des <strong>berechtigten Interesses</strong> des Betreibers, Teilnehmer:innen einen sicheren temporären Mail-Service für Workshops anzubieten (Art. 6 Abs. 1 lit. f DSGVO). Teilnehmer:innen entscheiden selbst, an wen sie ihre temporäre Adresse weitergeben.</p>
    <p><strong>Cloudflare, Inc.</strong> verarbeitet die Daten als <strong>Auftragsverarbeiter</strong> (Art. 28 DSGVO) auf Grundlage des <a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noopener">Cloudflare Data Processing Addendum</a>. Die genutzten Cloudflare-Dienste (Workers, D1, Email Routing) laufen primär in EU-Rechenzentren. Falls Daten in andere Regionen übertragen werden, geschieht dies mit DSGVO-Schutzmaßnahmen nach Art. 46 (Standardvertragsklauseln). Cloudflare ist im EU-US Data Privacy Framework zertifiziert.</p>
    ${c.googleActive ? `<p>Zur Bereitstellung der Wegwerf-Logins (Gemini/NotebookLM) werden Daten an <strong>Google LLC (USA)</strong> übermittelt (Cloud Identity / Admin SDK). Dies ist ein <strong>Drittlandtransfer</strong>; Google ist im EU-US Data Privacy Framework zertifiziert, ergänzend gelten Standardvertragsklauseln (Art. 46 DSGVO). Die angelegten Konten werden gemeinsam mit dem Postfach bei Ablauf automatisch gelöscht.</p>` : ''}
  </section>

  <section>
    <h2>Speicherdauer</h2>
    <ul>
      <li><strong>Empfangene Mails:</strong> maximal ${c.lifetimeHours} Stunden ab Erzeugung der Adresse — früher, sobald die Workshop-Leitung den Workshop beendet. Danach automatisch nicht mehr abrufbar.</li>
      <li><strong>Vergebene Adressen + Zeitstempel:</strong> dauerhaft. Grund: Eine einmal vergebene Adresse darf nie ein zweites Mal vergeben werden, da Zieldienste eine Adresse oft an genau ein Konto binden. Es werden ausschließlich die Adresse selbst und der Zeitstempel der Vergabe gespeichert – keine personenbezogenen Daten.</li>
      <li><strong>Betreiber- und Workshop-Einstellungen</strong> (z. B. Firmendaten für das Impressum, aktueller Workshop-Link): dauerhaft gespeichert, solange die Instanz betrieben wird.</li>
    </ul>
  </section>

  <section>
    <h2>Cookies</h2>
    <p>${escape(c.serviceName)} setzt <strong>keine Tracking-Cookies</strong>. Technisch notwendig ist ein Sitzungs-Cookie <code>mzm_t</code> (dein Workshop-Zugang; im Admin-Bereich zusätzlich <code>mzm_admin</code>). Zusätzlich speichert der Browser einen <code>localStorage</code>-Eintrag mit der zuletzt verwendeten Adresse${c.googleActive ? ' und dem zugehörigen Google-Login samt Passwort, damit du ihn erneut ablesen kannst' : ''}, damit du beim erneuten Aufruf nicht von vorne anfangen musst. Diese Einträge verlassen dein Gerät nicht.</p>
  </section>

  <section>
    <h2>Workshops</h2>
    <p>${escape(c.serviceName)} ist für den Einsatz in <strong>Bildungs-Workshops</strong> gedacht. Die zugeteilten Mail-Adressen sind nicht für die langfristige oder geschäftliche Kommunikation geeignet. Die Verantwortung für die Aufklärung der Teilnehmer:innen über Zweck und Funktionsweise des Dienstes liegt bei der durchführenden Person.</p>
  </section>

  <section>
    <h2>Deine Rechte</h2>
    <ul>
      <li><strong>Auskunft</strong> (Art. 15 DSGVO): Was wir über dich gespeichert haben – in der Regel nichts Personenbezogenes, weil wir keine Identitätsdaten erheben.</li>
      <li><strong>Löschung</strong> (Art. 17 DSGVO): Auf Anfrage löschen wir empfangene Mails an eine bestimmte Adresse vorzeitig.</li>
      <li><strong>Widerspruch</strong> (Art. 21 DSGVO): Schließe das Browserfenster und nutze die Adresse nicht mehr – mehr ist nicht nötig.</li>
      <li><strong>Beschwerde</strong> (Art. 77 DSGVO): Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien (<a href="https://dsb.gv.at" target="_blank" rel="noopener">dsb.gv.at</a>)</li>
    </ul>
  </section>

  <section>
    <h2>Hinweis zu eingehenden Mails</h2>
    <p>Du nutzt ${escape(c.serviceName)} auf eigene Verantwortung. Sicherheitskritische Vorgänge (Passwort-Resets, Banking-Bestätigungen, behördliche Mitteilungen) sollten <strong>nicht über eine temporäre Workshop-Adresse</strong> abgewickelt werden, da der Posteingang technisch von allen einsehbar ist, die die Adresse kennen.</p>
  </section>
  `;
  return htmlShell('Datenschutz – ' + c.serviceName, body, { legal: true });
}

export function renderNutzungsbedingungen(ctx) {
  const c = resolveLegal(ctx);
  const sn = escape(c.serviceName);
  const stand = c.legalDate ? ` · Stand: ${escape(c.legalDate)}` : '';
  // "Reachable at" = the actual URL this page is served from (origin), so it adapts
  // to wherever the instance is installed; falls back to the mail domain.
  const siteUrl = (ctx && ctx.origin) || ('https://' + c.mailDomain);
  const siteLabel = siteUrl.replace(/^https?:\/\//, '');
  const body = `
  <a class="back-link" href="/">&larr; Zurück zur Startseite</a>
  <h1>Nutzungsbedingungen</h1>
  <p class="legal__subtitle">${sn}${stand}</p>

  <section>
    <h2>1. Geltungsbereich</h2>
    <p>Diese Nutzungsbedingungen gelten für die Nutzung von <strong>${sn}</strong> (erreichbar unter <a href="${escape(siteUrl)}">${escape(siteLabel)}</a>), einem temporären Mail-Service für Bildungs-Workshops, betrieben von:</p>
    <div class="legal__block">
      <p>${escape(c.name)}<br>
      Inhaber: ${escape(c.owner)}<br>
      ${escape(c.street)}, ${escape(c.city)}, ${escape(c.country)}<br>
      <a href="mailto:${escape(c.email)}">${escape(c.email)}</a></p>
      ${c.registry ? `<p>GISA: ${escape(c.registry.gisa)} &middot; UID: ${escape(c.registry.uid)}<br>
      FN: ${escape(c.registry.fn)} &middot; Firmenbuchgericht: ${escape(c.registry.court)}</p>` : ''}
    </div>
    <p>Mit der Nutzung von ${sn} akzeptierst du diese Nutzungsbedingungen.</p>
  </section>

  <section>
    <h2>2. Was ${sn} ist – und was nicht</h2>
    <p>${sn} ist ein Werkzeug für Bildungs-Workshops, mit dem Teilnehmer:innen sich kurzzeitig bei externen Diensten registrieren können, ohne ihre echte Mail-Adresse preiszugeben.</p>
    <div class="legal__block legal__highlight">
      <ul>
        <li>${sn} ist <strong>kein öffentlicher Mail-Dienst</strong>. Der Zugang läuft ausschließlich über einen persönlichen Workshop-Link.</li>
        <li>${sn} ist <strong>kein zuverlässiges Mail-Postfach</strong> – Adressen laufen automatisch spätestens nach ${c.lifetimeHours} Stunden ab — oft früher, sobald die Workshop-Leitung den Workshop beendet.</li>
        <li>${sn} ist <strong>nicht für sicherheitskritische Kommunikation</strong> geeignet (Passwort-Resets bei echten Konten, Banking, Behörden). Wer die Adresse kennt, kann den Posteingang einsehen.</li>
        <li>${sn} bietet <strong>keine Verfügbarkeitsgarantie</strong>. Der Dienst kann jederzeit eingeschränkt, geändert oder eingestellt werden.</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>3. Zielgruppe</h2>
    <p>malziMAIL richtet sich an Trainer:innen, Lehrkräfte und ihre Workshop-Teilnehmer:innen. Die Nutzung außerhalb dieses Kontextes ist nicht vorgesehen.</p>
    <p>Bei Teilnehmer:innen unter 14 Jahren empfehlen wir die Einholung einer Einwilligung der Erziehungsberechtigten – insbesondere wenn echte Mail-Adressen (auch temporäre) für Registrierungen verwendet werden.</p>
  </section>

  <section>
    <h2>4. Erlaubte Nutzung</h2>
    <p>Du darfst malziMAIL nutzen, um:</p>
    <ul>
      <li>im Rahmen eines Bildungs-Workshops eine temporäre Mail-Adresse für eine einzelne Registrierung zu erzeugen,</li>
      <li>die in den Posteingang eingehenden Bestätigungsmails zu lesen und enthaltene Bestätigungslinks zu öffnen,</li>
      <li>die Adresse innerhalb des aktiven Workshops zu verwenden, solange sie nicht abgelaufen ist.</li>
    </ul>
  </section>

  <section>
    <h2>5. Verbotene Nutzung</h2>
    <p>Folgende Nutzungen sind ausdrücklich untersagt:</p>
    <ul>
      <li><strong>Illegale oder schädigende Zwecke:</strong> Nutzung für Spam, Phishing, Betrug, Identitätsmissbrauch oder zur Umgehung von Sicherheitsmaßnahmen Dritter.</li>
      <li><strong>Anmeldung bei sicherheitskritischen Diensten:</strong> Banking, Behörden, Krankenkassen, Versicherungen, alles was eine zuverlässige und dauerhaft erreichbare Mail-Adresse erfordert.</li>
      <li><strong>Massenregistrierungen:</strong> Automatisierte Erzeugung von Adressen zur Anlage zahlreicher Konten bei einem Dienst (Sockenpuppen, Fake-Accounts, Boost von Bewertungen, etc.).</li>
      <li><strong>Automatisierte Zugriffe:</strong> Bots, Scraper oder Massenanfragen.</li>
      <li><strong>Umgehung von Schutzmaßnahmen:</strong> Versuche, die Token-Validierung oder andere technische Schutzmaßnahmen zu umgehen.</li>
      <li><strong>Weitergabe des Workshop-Links:</strong> Der Workshop-Link ist persönlich und darf nur an Workshop-Teilnehmer:innen weitergegeben werden, nicht öffentlich gepostet werden.</li>
      <li><strong>Kommerzielle Nutzung ohne Zustimmung:</strong> Die Nutzung von ${sn} gegen Entgelt ist ohne vorherige schriftliche Zustimmung nicht gestattet.</li>
    </ul>
  </section>

  <section>
    <h2>6. Datenverarbeitung</h2>
    <p>Die vollständige Beschreibung der Datenverarbeitung findest du in unserer <a href="/datenschutz">Datenschutzerklärung</a>. Zusammengefasst:</p>
    <ul>
      <li>Empfangene Mails werden maximal ${c.lifetimeHours} Stunden gespeichert (früher, sobald der Workshop beendet wird), danach automatisch nicht mehr abrufbar.</li>
      <li>Vergebene Adressen bleiben dauerhaft in der Datenbank (nur Adresse + Zeitstempel, kein Personenbezug), damit dieselbe Adresse nie ein zweites Mal vergeben wird.</li>
      <li>Es gibt kein Tracking, keine Werbung, keinen Datenverkauf.</li>
      <li>Die Verarbeitung läuft auf Cloudflare-Infrastruktur in der EU.</li>
    </ul>
  </section>

  <section>
    <h2>7. Haftungsausschluss</h2>
    <ul>
      <li><strong>Keine Gewähr für Zustellung:</strong> Nicht alle externen Mail-Dienste akzeptieren Mails an temporäre Adressen. Wenn eine Bestätigungsmail vom Zieldienst nicht ankommt, kann das auch an dessen Spamfilter liegen.</li>
      <li><strong>Keine Garantie auf Vertraulichkeit:</strong> Wer die zugeteilte Adresse kennt, kann den Posteingang aufrufen. Nutze die Adresse daher nur für unkritische Registrierungen.</li>
      <li><strong>Keine Verfügbarkeitsgarantie:</strong> ${sn} wird als kostenloser Service ohne Service-Level-Agreement bereitgestellt. Der Dienst kann jederzeit eingeschränkt, geändert oder eingestellt werden.</li>
      <li><strong>Keine Haftung für Missbrauch:</strong> Wer eine zugeteilte Adresse entgegen dieser Nutzungsbedingungen einsetzt, trägt die alleinige Verantwortung.</li>
      <li><strong>Technische Einschränkungen:</strong> Mails über 25&nbsp;MiB werden von Cloudflare Email Routing abgelehnt. Mails, die Spamfilter auslösen, können verworfen werden.</li>
    </ul>
  </section>

  <section>
    <h2>8. Geistiges Eigentum</h2>
    <ul>
      <li>Das Design der Website ist urheberrechtlich geschützt.</li>
      <li>Empfangene Mails verbleiben im Eigentum des jeweiligen Absenders bzw. Empfängers im rechtlichen Sinne; der Betreiber erhebt keinen Anspruch auf deren Inhalte.</li>
    </ul>
  </section>

  <section>
    <h2>9. Workshops</h2>
    <p>Der Betreiber, der ${sn} einsetzt, ist verpflichtet:</p>
    <ul>
      <li>den Workshop-Link nur an Teilnehmer:innen des jeweiligen Workshops weiterzugeben,</li>
      <li>die Teilnehmer:innen über den temporären Charakter der Adressen aufzuklären,</li>
      <li>den Workshop zeitlich begrenzt zu aktivieren und bei Missbrauch-Verdacht angemessen zu reagieren.</li>
    </ul>
  </section>

  <section>
    <h2>10. Änderungen der Nutzungsbedingungen</h2>
    <p>Der Betreiber behält sich vor, diese Nutzungsbedingungen jederzeit zu ändern. Änderungen werden auf dieser Seite veröffentlicht. Die fortgesetzte Nutzung von ${sn} nach einer Änderung gilt als Zustimmung zu den aktualisierten Bedingungen.</p>
  </section>

  <section>
    <h2>11. Anwendbares Recht und Gerichtsstand</h2>
    <p>Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts. Für Verbraucher:innen gelten die zwingenden Bestimmungen des Konsumentenschutzgesetzes (KSchG) uneingeschränkt. Gerichtsstand ist, soweit gesetzlich zulässig, Linz, Österreich.</p>
    <p>Für die außergerichtliche Beilegung von Verbraucherstreitigkeiten stellt die EU eine Online-Plattform bereit: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener">https://ec.europa.eu/consumers/odr</a></p>
  </section>

  <section>
    <h2>12. Kontakt</h2>
    <p>Bei Fragen zu diesen Nutzungsbedingungen:</p>
    <ul>
      <li>Allgemein: <a href="mailto:${escape(c.email)}">${escape(c.email)}</a></li>
      <li>Datenschutz: <a href="mailto:${escape(c.emailPrivacy)}">${escape(c.emailPrivacy)}</a></li>
    </ul>
  </section>
  `;
  return htmlShell('Nutzungsbedingungen – ' + c.serviceName, body, { legal: true });
}
