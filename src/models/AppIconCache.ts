import mongoose, { Document, Schema } from 'mongoose';

export interface IAppIconCache extends Document {
  packageName: string;
  iconData: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AppIconCacheSchema: Schema = new Schema(
  {
    packageName: { type: String, required: true, unique: true, index: true },
    iconData: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAppIconCache>('AppIconCache', AppIconCacheSchema);
