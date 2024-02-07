import { createServer } from 'node:http'
import QRCode from 'qrcode'
import {config, jsonHeaders, roles} from './init.js'
import credential from './pensioncredential.json' assert {'type': 'json'}

const issueUrl = `${config.credentials_api}/openid4vc/credential_offer`
let apiHeaders = jsonHeaders

async function createOffer() {
  credential.issuer = roles.issuer.did
  credential.issuanceDate = new Date().toISOString()
  const credParams = {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      "credential": credential,
      "issuerDid": roles.issuer.did,
    })
  }
  credParams.headers.Accept = '*/*'
  credParams.headers['X-ORGANIZATION-ID'] = roles.issuer.id

  // console.log(issueUrl, credParams)
  const resp = await fetch(issueUrl, credParams)
  const obj = await resp.json()
  const offerUri = obj.credentialOfferUri
  // console.log(resp.status, offerUri)
  const credentialOffer = `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(offerUri)}`
  if (!createOffer) {
    // console.warn('No credential offer!')
    // console.log(issueUrl, credParams)
    // console.log(JSON.stringify(obj, null, 1))
    // refresh auth token
    const init = await import('./init.js')
    apiHeaders = init.jsonHeaders
    return createOffer()
  }
  console.log(credentialOffer)
  return credentialOffer  
}

const sendOffer = async function (req, res) {
  if (req.url !== '/') {
    res.setHeader("Content-Type", "text/plain")
    res.writeHead(404)
    res.end(`Not Found`)
    return false
  }
  const offer = await createOffer()
  const dataURL = await QRCode.toDataURL(offer)
  res.setHeader("Content-Type", "text/html")
  res.writeHead(200)
  res.end(`<!DOCTYPE html>
<html>
 <meta charset="UTF-8">
 <title>SICPA myöntää eläketodisteen</title>
 <body style="text-align: center;">
  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Kela_suomi_kela-1-.jpg/220px-Kela_suomi_kela-1-.jpg" alt="Kela" />
  <h1>Heippa vahvasti tunnistettu asiakas!</h1>
  <p>Skannaapa oheinen QR-koodi digikukkarollasi niin laitetaan sinne eläketodistetta tulemaan...</p>
  <a href="${offer}"><img src="${dataURL}" alt="Credential Offer QR Code" /></a>
 </body>
</html>`)
}

const server = createServer(sendOffer)
server.listen(config.issuer_port, config.server_host, () => {
    console.log(`Server is running on http://${config.server_host}:${config.issuer_port}`)
})
