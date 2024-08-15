import config from './config.json' with {type: 'json'}

const params = {
    method: 'POST',
    headers: {
        'Content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: "client_credentials"    
    })
}

export default async function auth() {
    // console.log(config)
    // console.log(config.token_url, params)
    const resp = await fetch(config.token_url, params)
    if (resp.status != 200) {
        console.error(resp.status, config.token_url)
        // console.log(JSON.stringify(params, null, 1))
        console.log(params)
    }
    const json = await resp.json()
    // console.log(JSON.stringify(json, null, 1))
    const auth_token = json.access_token
    if (!auth_token) {
        throw new Error('Auth token refresh failed!')
        console.log(json)
    }
    // console.log(`Got auth token: ${auth_token}`)
    return `Bearer ${auth_token}`
}

