# Channel API
The API exposes two endpoints:

## Create Channel
Post **/channel**

Create a new channel

Take a request of the form :
```
{
	"name":"goblin-test"
}
```

If successful, return:

```
{
  "name": "goblin-test",
  "id": 4
}
```

## Enter Channel
Post **/channel/enter**

Require authentication in the form of a Authorization header with a valid token.

Enter a new channel. It will add the channel to the list of the channel the user is in.

Take a request of the form :
```
{
	"channel":"goblin-test"
}
```

If successful, return a standard 200 code without output
