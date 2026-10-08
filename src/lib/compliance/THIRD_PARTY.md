# Third-party data

`phone-timezones.json` maps phone number prefixes (country calling code plus
leading digits, no `+`) to the time zones a number with that prefix may be in.

- Source: Google libphonenumber, `resources/timezones/map_data.txt`
  (Apache License 2.0, Copyright The Libphonenumber Authors), as packaged in
  `libphonenumber-geo-carrier@2.0.0` (`resources/timezones.bson`, MIT).
- Converted from BSON to JSON with the `&`-joined zone lists split into arrays.
  No entries were added, removed, or edited.

To refresh it, decode a newer `timezones.bson` the same way and replace the file.
