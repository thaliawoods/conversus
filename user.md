# User API
The API exposes two endpoints:

## Login
POST **/login**, which is expecting a POST request with a JSON payload of the form:

Require a payload of the form :
```
{"username": "Alice", "password": "password123"}
```

If the credentials are valid, it responds with 200 OK, returning a JWT token in the response body which is valid for 60 minutes.

## Create User
Post **/user**

Create a new user

Take a request of the form :
```
{
	"username":"isabelle",
	"password":"reisen"
}
```

If successful, return:

```
{
  "username": "isabelle",
  "channels": [
    {
      "name": "general",
      "id": 5,
      "creation_date": "2026-11-02T09:43:22.190494Z"
    }
  ],
  "id": 1
}
```

Same information as /me. Users are automatically added to the general channels. Better error handling will happen but for now ask the dev if it return a 500.

## My informations
GET **/me**

Require authentication in the form of a Authorization header with a valid token.

Return relevant informations about the currently logged in user.

```
{
  "username": "isabelle",
  "channels": [
    {
      "name": "goblin-tests",
      "id": 4,
      "creation_date": "2026-11-02T08:20:38.75406Z"
    },
    {
      "name": "general",
      "id": 5,
      "creation_date": "2026-11-02T09:43:22.190494Z"
    }
  ],
  "id": 1
}
```
username is the name of the logged in user
id is the internal ID of the logged in user
channel is the list of channel the user is in
