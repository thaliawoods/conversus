package channels

import "encoding/json"

type Channel struct {
	Name string `json:"name"`
	ID int64    `json:"id"`
	CreationDate string `db:"creation_date" json:"creation_date"`
	RawMetadata  []byte  `db:"metadata" json:"-"`
	Metadata     map[string]json.RawMessage  `db:"-" json:"metadata"`
}
