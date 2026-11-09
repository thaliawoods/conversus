# Message API
The API exposes two endpoints:

## Create Message
POST **/channel/message**

Create a new channel

Take a request of the form :
```
{
  "content":"this is some kind of content",
  "channel":4
}
```

If successful, return:

```
{
  "content": "this is some kind of content",
  "user_id": 2,
  "user": "internal-clock",
  "creation_date": "2026-11-02T10:00:24.255584Z"
}
```

## Get Message
GET **/channel/message**

Receive messages from a channel

Require a GET parameter called channel with the ID of the channel

If successful, return:

```
[
  {
    "content": "clock tick : Mon Nov  2 10:00:14 UTC 2026",
    "user_id": 2,
    "user": "internal-clock",
    "creation_date": "2026-11-02T10:00:14.262609Z"
  },
  {
    "content": "clock tick : Mon Nov  2 10:00:24 UTC 2026",
    "user_id": 2,
    "user": "internal-clock",
    "creation_date": "2026-11-02T10:00:24.255584Z"
  },
  {
    "content": "clock tick : Mon Nov  2 10:00:34 UTC 2026",
    "user_id": 2,
    "user": "internal-clock",
    "creation_date": "2026-11-02T10:00:34.258499Z"
  }
]
```

## Websocket

To be implemented
