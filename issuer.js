import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import QRCode from 'qrcode'
import config from './config.json' assert {'type': 'json'}
import credential from './pensioncredential.json' assert {'type': 'json'}
import { auth_token } from './auth.js'
import {db, roles} from './init.js'

// console.log(roles)
// console.log(JSON.stringify(credential, null, 2))

/*
const holder = {
    did: "did:something:..."
}
*/
const hash = createHash('sha256')
const salt = config.ns_prefix

const issueUrl = `${config.credentials_api}/openid4vc/credential_offer`
const credParams = {
  method: 'POST',
  headers: {
    'Authorization': auth_token,
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'X-ORGANIZATION-ID': roles.issuer.id,
  },
  body: JSON.stringify({
    "credential": credential,
    "issuerDid": roles.issuer.did,
  })
}
// console.log(issueUrl, credParams)
const resp = await fetch(issueUrl, credParams)
const obj = await resp.json()
const offerUri = obj.credentialOfferUri
// console.log(resp.status, offerUri)
const credentialOffer = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUri)}`
console.log(credentialOffer)

const sendOffer = async function (req, res) {
  const dataURL = await QRCode.toDataURL(credentialOffer)

  res.setHeader("Content-Type", "text/html");
  res.writeHead(200);
  res.end(`<!DOCTYPE html>
<html>
 <meta charset="UTF-8">
 <body style="text-align: center;">
  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Kela_suomi_kela-1-.jpg/220px-Kela_suomi_kela-1-.jpg" alt="Kela" />
  <h1>Heippa vahvasti tunnistettu asiakas!</h1>
  <p>Skannaapa oheinen QR-koodi digikukkarollasi niin laitetaan sinne eläketodistetta tulemaan...</p>
  <a href="${credentialOffer}"><img src="${dataURL}" alt="Credential Offer QR Code" /></a>
 </body>
</html>`);
};

const server = createServer(sendOffer);
server.listen(config.issuer_port, config.server_host, () => {
    console.log(`Server is running on http://${config.server_host}:${config.issuer_port}`);
});
